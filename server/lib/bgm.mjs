import { BGM_API, CACHE_TTL, DEFAULT_PROXY } from './config.mjs';
import { bgmLimiter, request, requestJson } from './util.mjs';
import { cached } from './cache.mjs';
import { getSettings } from './store.mjs';

const UA = 'AnimeDaily/0.1 (personal watchlist app; local use)';

function proxyUrl() {
  const raw = getSettings().proxyUrl;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

async function api(path, options = {}) {
  const url = `${BGM_API}${path}`;
  return bgmLimiter.run(() =>
    requestJson(url, {
      ...options,
      proxyUrl: proxyUrl(),
      timeout: 35000,
      retries: 3,
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'Accept-Encoding': 'identity',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers ?? {}),
      },
    }),
  );
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Bangumi 的部分标题里带 HTML 实体（如 &amp;），统一解码 */
function decodeEntities(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code) => {
    if (code[0] === '#') {
      const cp = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function pickImage(images) {
  if (!images) return '';
  // 优先取 Bangumi 的中等规格（约 400px 宽），原图动辄 600KB+，列表里完全用不上
  const url = images.common || images.medium || images.small || images.large || images.grid || '';
  return typeof url === 'string' ? url.replace(/^http:\/\//i, 'https://') : '';
}

export function normalizeSubject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = Number(raw.id ?? raw.subject_id);
  if (!Number.isFinite(id)) return null;
  const ratingValue = Number(raw.rating?.score);
  const doing = Number(raw.collection?.doing ?? raw.collection?.doing_count ?? NaN);
  return {
    subjectId: id,
    name: decodeEntities(raw.name),
    nameCn: decodeEntities(raw.name_cn),
    cover: pickImage(raw.images),
    date: raw.date ?? raw.air_date ?? null,
    airWeekday: Number(raw.air_weekday) >= 1 && Number(raw.air_weekday) <= 7 ? Number(raw.air_weekday) : null,
    platform: raw.platform ?? null,
    totalEps: Number(raw.total_episodes) > 0 ? Number(raw.total_episodes) : Number(raw.eps) > 0 ? Number(raw.eps) : null,
    rating: Number.isFinite(ratingValue) && ratingValue > 0 ? Math.round(ratingValue * 10) / 10 : null,
    doing: Number.isFinite(doing) ? doing : null,
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 8).map((t) => decodeEntities(t.name)).filter(Boolean) : [],
    summary: typeof raw.summary === 'string' ? decodeEntities(raw.summary.replace(/\r/g, '')).trim() : '',
  };
}

function normalizeCalendarDay(day) {
  const weekday = Number(day?.weekday?.id);
  const items = Array.isArray(day?.items) ? day.items : [];
  return {
    weekday: Number.isFinite(weekday) ? weekday : 0,
    weekdayCn: day?.weekday?.cn ?? '',
    items: items.map(normalizeSubject).filter(Boolean),
  };
}

/** 每日放送：Bangumi 官方 7 天表，1=周一 … 7=周日 */
export async function getCalendar() {
  const { data, stale, age } = await cached('calendar', 'week', CACHE_TTL.calendar, async () => {
    const { data: raw, via } = await api('/calendar');
    if (!Array.isArray(raw)) throw new Error('Bangumi 日历响应异常');
    return { days: raw.map(normalizeCalendarDay), fetchedAt: Date.now(), via: via ?? 'proxy' };
  });
  return { ...data, stale, age };
}

export async function getSubject(subjectId) {
  const id = Number(subjectId);
  const { data, stale } = await cached('subject', String(id), CACHE_TTL.subject, async () => {
    const { data: raw } = await api(`/v0/subjects/${id}`);
    return normalizeSubject(raw) ?? {};
  });
  return { ...data, stale };
}

/** 逐话放送日期：airdate 是 Bangumi 唯一可靠的「第几话哪天播」数据 */
export async function getEpisodes(subjectId) {
  const id = Number(subjectId);
  const { data, stale } = await cached('episodes', String(id), CACHE_TTL.episodes, async () => {
    const all = [];
    let offset = 0;
    for (let page = 0; page < 6; page++) {
      const { data: raw } = await api(`/v0/episodes?subject_id=${id}&type=0&limit=100&offset=${offset}`);
      const list = Array.isArray(raw?.data) ? raw.data : [];
      all.push(...list);
      const total = Number(raw?.total ?? 0);
      offset += list.length;
      if (list.length < 100 || offset >= total) break;
    }
    return all
      .map((ep) => ({
        id: Number(ep.id),
        ep: Number.isFinite(Number(ep.ep)) ? Number(ep.ep) : Number(ep.sort),
        sort: Number(ep.sort ?? ep.ep ?? 0),
        airdate: typeof ep.airdate === 'string' && ep.airdate.length >= 10 ? ep.airdate.slice(0, 10) : null,
        name: ep.name ?? '',
        nameCn: ep.name_cn ?? '',
      }))
      .filter((ep) => Number.isFinite(ep.ep))
      .sort((a, b) => a.sort - b.sort);
  });
  return { episodes: data, stale };
}

export async function searchSubjects(keyword, { limit = 24, offset = 0 } = {}) {
  const q = String(keyword ?? '').trim();
  if (!q) return { items: [], total: 0 };
  const { data } = await cached('search', `${q}:${limit}:${offset}`, CACHE_TTL.search, async () => {
    const { data: raw } = await api(`/v0/search/subjects?limit=${limit}&offset=${offset}`, {
      method: 'POST',
      body: JSON.stringify({ keyword: q, filter: { type: [2] } }),
    });
    return {
      items: (raw?.data ?? []).map(normalizeSubject).filter(Boolean),
      total: Number(raw?.total ?? 0),
    };
  });
  return data;
}

/** 公开收藏（无需 OAuth）：type 1想看 2看过 3在看 4搁置 5抛弃 */
export async function getUserCollections(username, { types = [3, 1], limit = 100 } = {}) {
  const name = String(username ?? '').trim();
  if (!name) throw new Error('请先填写 Bangumi 用户名');
  const { data } = await cached('collections', `${name}:${types.join('_')}`, CACHE_TTL.collections, async () => {
    const out = [];
    for (const type of types) {
      let offset = 0;
      for (let page = 0; page < 4; page++) {
        const { data: raw } = await api(
          `/v0/users/${encodeURIComponent(name)}/collections?subject_type=2&type=${type}&limit=50&offset=${offset}`,
        );
        const list = Array.isArray(raw?.data) ? raw.data : [];
        out.push(...list);
        const total = Number(raw?.total ?? 0);
        offset += list.length;
        if (list.length < 50 || offset >= Math.min(total, limit)) break;
      }
    }
    return out.map((row) => ({
      subject: normalizeSubject(row?.subject ?? { id: row?.subject_id }),
      type: Number(row?.type ?? 0),
      epStatus: Number(row?.ep_status ?? 0),
      rate: Number(row?.rate ?? 0),
      updatedAt: row?.updated_at ?? null,
      comment: row?.comment ?? null,
    })).filter((row) => row.subject);
  });
  return data;
}

export async function probeNetwork() {
  const started = Date.now();
  const result = { proxy: { ok: false, ms: null }, direct: { ok: false, ms: null }, proxyUrl: getSettings().proxyUrl ?? DEFAULT_PROXY };
  try {
    const t = Date.now();
    await request('https://api.bgm.tv/', { proxyUrl: proxyUrl(), timeout: 12000, retries: 1, headers: { 'User-Agent': UA } });
    result.proxy = { ok: true, ms: Date.now() - t };
  } catch (error) {
    result.proxy.error = error.message;
  }
  try {
    const t = Date.now();
    await request('https://api.bgm.tv/', { proxyUrl: null, timeout: 8000, retries: 1, headers: { 'User-Agent': UA } });
    result.direct = { ok: true, ms: Date.now() - t };
  } catch (error) {
    result.direct.error = error.message;
  }
  result.ms = Date.now() - started;
  return result;
}
