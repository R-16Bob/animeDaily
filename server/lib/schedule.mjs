const WEEKDAY_CN = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const WEEKDAY_LONG = ['', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

const dateKeyCache = new Map();

function tzFormatter(tz) {
  if (!dateKeyCache.has(tz)) {
    dateKeyCache.set(
      tz,
      new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }),
    );
  }
  return dateKeyCache.get(tz);
}

/** 当前时区下的日期键 YYYY-MM-DD */
export function todayKey(tz = 'Asia/Tokyo') {
  try {
    return tzFormatter(tz).format(new Date());
  } catch {
    return tzFormatter('Asia/Tokyo').format(new Date());
  }
}

export function parseKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return { y, m, d };
}

export function keyToUtc(key) {
  const { y, m, d } = parseKey(key);
  return Date.UTC(y, m - 1, d);
}

/** 1=周一 … 7=周日 */
export function weekdayOfKey(key) {
  const day = new Date(keyToUtc(key)).getUTCDay(); // 0=周日
  return ((day + 6) % 7) + 1;
}

export function addDays(key, delta) {
  const next = new Date(keyToUtc(key) + delta * 86400000);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysBetween(fromKey, toKey) {
  return Math.round((keyToUtc(toKey) - keyToUtc(fromKey)) / 86400000);
}

export function weekdayLabel(weekday, long = false) {
  return (long ? WEEKDAY_LONG : WEEKDAY_CN)[weekday] ?? '';
}

export function prettyDate(key) {
  const { m, d } = parseKey(key);
  return `${m}月${d}日`;
}

/** 本周周一 */
export function mondayOfWeek(key) {
  return addDays(key, -(weekdayOfKey(key) - 1));
}

/** 依据首播日期与放送星期推算某一话的编号（Bangumi 日历不提供逐话信息时的兜底） */
export function estimateEpisode(airDate, dateKey) {
  if (!airDate || airDate.length < 10) return null;
  const startKey = airDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey)) return null;
  const diff = daysBetween(startKey, dateKey);
  if (diff < 0) return null;
  const ep = Math.floor(diff / 7) + 1;
  return ep >= 1 && ep <= 2000 ? ep : null;
}

/**
 * 从真实逐话放送日期推导「放送星期」：取众数，比日历字段更贴近实际。
 */
export function deriveWeekday(episodes) {
  const votes = new Map();
  for (const ep of episodes) {
    if (!ep.airdate) continue;
    const weekday = weekdayOfKey(ep.airdate);
    votes.set(weekday, (votes.get(weekday) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [weekday, count] of votes) {
    if (count > bestCount) {
      best = weekday;
      bestCount = count;
    }
  }
  return bestCount >= 2 ? best : null;
}

/**
 * 判断某部追番在指定日期是否更新、更新第几话。
 * 优先使用真实 airdate（命中即精确）；缺失时才按放送星期 + 上一话编号推算，
 * 且推算必须允许（allowEstimate）——已完结的番不该每周都冒出来。
 */
export function resolveTodayEpisode(follow, episodes, dateKey, { allowEstimate = true } = {}) {
  const targetWeekday = weekdayOfKey(dateKey);
  const withDate = (episodes ?? []).filter((ep) => ep.airdate);
  const exact = withDate.find((ep) => ep.airdate === dateKey);
  if (exact) return { ep: exact.ep, exact: true, airdate: exact.airdate, name: exact.nameCn || exact.name };
  if (!allowEstimate) return null;

  const airWeekday = follow.airWeekday ?? deriveWeekday(withDate) ?? (follow.airDate ? weekdayOfKey(follow.airDate) : null);
  if (!airWeekday || airWeekday !== targetWeekday) return null;

  const past = withDate.filter((ep) => ep.airdate < dateKey).sort((a, b) => (a.airdate < b.airdate ? 1 : -1))[0];
  if (past) return { ep: past.ep + 1, exact: false, airdate: null, name: '' };
  const estimated = estimateEpisode(follow.airDate, dateKey);
  return estimated ? { ep: estimated, exact: false, airdate: null, name: '' } : null;
}

/**
 * 是否「当前连载中」。用于过滤历史番剧：
 * 1. 还有未来话数 → 在连载
 * 2. 已播话数达到总话数 → 已完结
 * 3. 出现在 Bangumi 今日放送表里 → 在连载（Bangumi 的日历只收录当季）
 * 4. 上一话在 7 天内播过 → 认为仍在连载（应对未来话数没填 airdate 的情况）
 */
export function decideAiring({ episodes, dateKey, totalEps, calendarWeekday }) {
  const withDate = (episodes ?? []).filter((ep) => ep.airdate);
  const last = lastAiredEpisode(withDate, dateKey);
  if (totalEps && last && last.ep >= totalEps) return false;
  if (withDate.some((ep) => ep.airdate > dateKey)) return true;
  if (calendarWeekday && calendarWeekday === weekdayOfKey(dateKey)) return true;
  if (last) {
    const age = daysBetween(last.airdate, dateKey);
    if (age >= 0 && age <= 7) return true;
  }
  return false;
}

export function lastAiredEpisode(episodes, dateKey) {
  const past = (episodes ?? []).filter((ep) => ep.airdate && ep.airdate <= dateKey);
  if (!past.length) return null;
  return past.sort((a, b) => (a.airdate < b.airdate ? 1 : -1))[0];
}

export function nextAiringEpisode(episodes, dateKey) {
  const upcoming = (episodes ?? []).filter((ep) => ep.airdate && ep.airdate > dateKey);
  if (!upcoming.length) return null;
  return upcoming.sort((a, b) => (a.airdate < b.airdate ? -1 : 1))[0];
}

/** 下一个该放送的日期：未来话数没填 airdate 时，按放送星期推算（今天算 0 天） */
export function nextWeekdayDate(weekday, dateKey) {
  if (!weekday) return null;
  const delta = (weekday - weekdayOfKey(dateKey) + 7) % 7;
  return addDays(dateKey, delta);
}

export function subjectTitle(subject) {
  return subject?.nameCn || subject?.name || '未知作品';
}
