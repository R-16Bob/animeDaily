import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_TTL, DATA_DIR, HOST, LAN_ENABLED, PORT, WEB_DIST, ensureDirs, lanAddresses } from './lib/config.mjs';
import { readJsonBody, sendJson } from './lib/util.mjs';
import { readAny, purgeCache, cacheStats } from './lib/cache.mjs';
import {
  getFollow,
  getSettings,
  listFollows,
  patchFollow,
  removeFollow,
  setMeta,
  updateSettings,
  upsertFollow,
} from './lib/store.mjs';
import { getCalendar, getEpisodes, getSubject, getUserCollections, probeNetwork, searchSubjects } from './lib/bgm.mjs';
import {
  addDays,
  decideAiring,
  deriveWeekday,
  estimateEpisode,
  lastAiredEpisode,
  mondayOfWeek,
  nextAiringEpisode,
  nextWeekdayDate,
  prettyDate,
  resolveTodayEpisode,
  todayKey,
  weekdayLabel,
  weekdayOfKey,
} from './lib/schedule.mjs';
import { coverStats, getCover, isAllowedCover, prewarmCovers } from './lib/image.mjs';

ensureDirs();

/* ------------------------------------------------------------------ 后台同步 */

const sync = { running: false, done: 0, total: 0, startedAt: null, error: null, queued: false };

function episodeCache(subjectId) {
  const entry = readAny('episodes', String(subjectId));
  return { episodes: Array.isArray(entry?.data) ? entry.data : [], ts: entry?.ts ?? 0 };
}

function needsSync(follow, force = false) {
  if (force) return true;
  const { episodes, ts } = episodeCache(follow.subjectId);
  return episodes.length === 0 || Date.now() - ts > CACHE_TTL.episodes;
}

function startSync({ force = false } = {}) {
  if (sync.running) {
    sync.queued = true;
    return sync;
  }
  const targets = listFollows().filter((f) => needsSync(f, force));
  if (!targets.length) {
    setMeta({ lastSyncAt: Date.now() });
    return sync;
  }
  sync.running = true;
  sync.done = 0;
  sync.total = targets.length;
  sync.startedAt = Date.now();
  sync.error = null;

  (async () => {
    for (const follow of targets) {
      try {
        await getEpisodes(follow.subjectId);
      } catch (error) {
        sync.error = error.message;
      } finally {
        sync.done += 1;
      }
    }
    sync.running = false;
    setMeta({ lastSyncAt: Date.now() });
    if (sync.queued) {
      sync.queued = false;
      setTimeout(() => startSync(), 500);
    }
  })();

  return sync;
}

function syncState() {
  return { running: sync.running, done: sync.done, total: sync.total };
}

/* ------------------------------------------------------------------ 视图组装 */

function calendarIndex(calendar) {
  const byId = new Map();
  const byWeekday = new Map();
  for (const day of calendar.days ?? []) {
    byWeekday.set(day.weekday, day.items ?? []);
    for (const item of day.items ?? []) {
      if (!byId.has(item.subjectId)) byId.set(item.subjectId, { ...item, calendarWeekday: day.weekday });
    }
  }
  return { byId, byWeekday };
}

function followCard(follow, calendarItem, dateKey, { allowHistoric = false } = {}) {
  const { episodes } = episodeCache(follow.subjectId);
  const derivedWeekday = deriveWeekday(episodes);
  const airWeekday = follow.airWeekday ?? derivedWeekday ?? calendarItem?.calendarWeekday ?? calendarItem?.airWeekday ?? null;
  const effective = { ...follow, airWeekday, airDate: follow.airDate ?? calendarItem?.date ?? null };
  const totalEps = follow.totalEps ?? calendarItem?.totalEps ?? (episodes.length ? episodes[episodes.length - 1].ep : null);
  const airing = decideAiring({
    episodes,
    dateKey,
    totalEps,
    calendarWeekday: calendarItem?.calendarWeekday ?? null,
  });
  // 只有确认在连载（或用户主动开启历史显示）时才允许按星期推算「今天更新」
  const today = resolveTodayEpisode(effective, episodes, dateKey, { allowEstimate: airing || allowHistoric });
  const last = lastAiredEpisode(episodes, dateKey);
  const next = nextAiringEpisode(episodes, dateKey);
  return {
    ...follow,
    cover: calendarItem?.cover || follow.cover || '',
    totalEps,
    airing,
    airWeekday,
    airWeekdayLabel: airWeekday ? weekdayLabel(airWeekday) : null,
    episodesKnown: episodes.length,
    todayEp: today ? today.ep : null,
    todayExact: today ? today.exact : false,
    pending: today ? follow.epWatched < today.ep : false,
    lastEp: last ? { ep: last.ep, airdate: last.airdate, name: last.nameCn || last.name } : null,
    nextEp: next ? { ep: next.ep, airdate: next.airdate, name: next.nameCn || next.name } : null,
    stale: !episodes.length,
  };
}

async function buildToday() {
  const settings = getSettings();
  const tz = settings.timezone || 'Asia/Shanghai';
  const dateKey = todayKey(tz);
  const weekday = weekdayOfKey(dateKey);
  const calendar = await getCalendar();
  const { byId, byWeekday } = calendarIndex(calendar);
  const follows = listFollows();

  const todayItems = (byWeekday.get(weekday) ?? []).map((item) => ({
    ...item,
    ep: estimateEpisode(item.date, dateKey),
    followed: follows.some((f) => f.subjectId === item.subjectId),
  }));

  const cards = follows
    .filter((f) => f.status === '在看')
    .map((f) => followCard(f, byId.get(f.subjectId), dateKey, { allowHistoric: Boolean(settings.showHistoric) }));
  const updates = cards
    .filter((c) => c.todayEp != null)
    .sort((a, b) => Number(b.todayExact) - Number(a.todayExact) || b.todayEp - a.todayEp);

  const upcoming = cards
    .filter((c) => c.airing && c.todayEp == null)
    .map((c) => {
      const real = c.nextEp;
      const airdate = real?.airdate ?? nextWeekdayDate(c.airWeekday, dateKey);
      const ep = real?.ep ?? (c.lastEp ? c.lastEp.ep + 1 : null);
      return {
        subjectId: c.subjectId,
        name: c.name,
        nameCn: c.nameCn,
        cover: c.cover,
        ep,
        airdate,
        estimated: !real,
        airWeekdayLabel: c.airWeekdayLabel,
        epWatched: c.epWatched,
        totalEps: c.totalEps,
      };
    })
    .filter((c) => c.airdate)
    .sort((a, b) => (a.airdate < b.airdate ? -1 : a.airdate > b.airdate ? 1 : 0))
    .slice(0, 6);

  return {
    date: dateKey,
    weekday,
    weekdayLabel: weekdayLabel(weekday, true),
    displayDate: prettyDate(dateKey),
    tz,
    calendarStale: Boolean(calendar.stale),
    calendarAge: calendar.age ?? 0,
    stats: {
      todayCount: todayItems.length,
      followedTotal: follows.length,
      updatesToday: updates.length,
      pending: updates.filter((u) => u.epWatched < u.todayEp).length,
      watching: follows.filter((f) => f.status === '在看').length,
      airing: cards.filter((c) => c.airing).length,
    },
    updates,
    upcoming,
    items: todayItems,
    sync: syncState(),
  };
}

async function buildWeek() {
  const settings = getSettings();
  const tz = settings.timezone || 'Asia/Shanghai';
  const today = todayKey(tz);
  const monday = mondayOfWeek(today);
  const calendar = await getCalendar();
  const follows = new Set(listFollows().map((f) => f.subjectId));
  const byId = new Map();
  for (const day of calendar.days ?? []) for (const item of day.items ?? []) byId.set(item.subjectId, item);

  const days = (calendar.days ?? [])
    .map((day) => {
      const date = addDays(monday, (day.weekday || 1) - 1);
      return {
        date,
        weekday: day.weekday,
        label: weekdayLabel(day.weekday),
        short: ['一', '二', '三', '四', '五', '六', '日'][(day.weekday || 1) - 1],
        displayDate: prettyDate(date),
        isToday: date === today,
        items: (day.items ?? []).map((item) => ({
          ...item,
          ep: estimateEpisode(item.date, date),
          followed: follows.has(item.subjectId),
        })),
      };
    })
    .sort((a, b) => a.weekday - b.weekday);

  return { today, tz, days, calendarStale: Boolean(calendar.stale), sync: syncState() };
}

async function buildFollows() {
  const settings = getSettings();
  const tz = settings.timezone || 'Asia/Shanghai';
  const dateKey = todayKey(tz);
  const follows = listFollows();
  const calendar = await getCalendar().catch(() => ({ days: [] }));
  const { byId } = calendarIndex(calendar);
  const cards = follows.map((f) =>
    followCard(f, byId.get(f.subjectId), dateKey, { allowHistoric: Boolean(settings.showHistoric) }),
  );
  return {
    follows: cards,
    stats: {
      total: cards.length,
      watching: cards.filter((c) => c.status === '在看').length,
      wish: cards.filter((c) => c.status === '想看').length,
      done: cards.filter((c) => c.status === '看过').length,
      updatesToday: cards.filter((c) => c.status === '在看' && c.todayEp != null).length,
      pending: cards.filter((c) => c.status === '在看' && c.todayEp != null && c.epWatched < c.todayEp).length,
    },
    sync: syncState(),
  };
}

/* ------------------------------------------------------------------ 静态资源 */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, urlPath) {
  if (!fs.existsSync(WEB_DIST)) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<!doctype html><meta charset="utf-8"><title>AnimeDaily</title><body style="font-family:system-ui;background:#0d0e12;color:#eee;padding:48px;line-height:1.8">' +
        '<h1>前端尚未构建</h1><p>请在项目根目录运行 <code style="background:#222;padding:2px 6px;border-radius:4px">pnpm build</code>，然后刷新本页。</p>' +
        '<p style="color:#888">开发模式请另开终端运行 <code style="background:#222;padding:2px 6px;border-radius:4px">pnpm dev:web</code></p></body>',
    );
    return;
  }
  let target = path.join(WEB_DIST, urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, ''));
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(WEB_DIST))) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    if (path.extname(urlPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    resolved = path.join(WEB_DIST, 'index.html');
  }
  const ext = path.extname(resolved).toLowerCase();
  const isAsset = resolved.includes(`${path.sep}assets${path.sep}`);
  const stat = fs.statSync(resolved);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(resolved).pipe(res);
}

/* ------------------------------------------------------------------ 路由 */

function routeMatch(pattern, pathname) {
  const parts = pattern.split('/').filter(Boolean);
  const segs = pathname.split('/').filter(Boolean);
  if (parts.length !== segs.length) return null;
  const params = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(segs[i]);
    else if (parts[i] !== segs[i]) return null;
  }
  return params;
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method ?? 'GET';
  const q = url.searchParams;

  let params;
  if (method === 'GET' && pathname === '/api/today') return sendJson(res, 200, await buildToday());
  if (method === 'GET' && pathname === '/api/week') return sendJson(res, 200, await buildWeek());
  if (method === 'GET' && pathname === '/api/follows') return sendJson(res, 200, await buildFollows());

  if (method === 'GET' && pathname === '/api/health') {
    const { files, bytes } = cacheStats();
    const covers = coverStats();
    return sendJson(res, 200, {
      ok: true,
      time: new Date().toISOString(),
      cache: { files, bytes },
      covers,
      sync: syncState(),
      follows: listFollows().length,
    });
  }

  if (method === 'POST' && pathname === '/api/network/probe') return sendJson(res, 200, await probeNetwork());

  if (method === 'GET' && pathname === '/api/search') {
    const keyword = q.get('q') ?? '';
    const offset = Number(q.get('offset') ?? 0) || 0;
    const result = await searchSubjects(keyword, { limit: 24, offset });
    const followed = new Set(listFollows().map((f) => f.subjectId));
    return sendJson(res, 200, {
      ...result,
      items: result.items.map((item) => ({ ...item, followed: followed.has(item.subjectId) })),
    });
  }

  if (method === 'GET' && (params = routeMatch('/api/subject/:id', pathname))) {
    const id = Number(params.id);
    const [subject, episodeData, follow] = await Promise.all([getSubject(id), getEpisodes(id), Promise.resolve(getFollow(id))]);
    return sendJson(res, 200, {
      subject,
      episodes: episodeData.episodes,
      follow,
      weekday: deriveWeekday(episodeData.episodes),
    });
  }

  if (method === 'POST' && pathname === '/api/follows') {
    const body = await readJsonBody(req);
    const id = Number(body.subjectId);
    if (!Number.isFinite(id)) return sendJson(res, 400, { error: '缺少 subjectId' });
    const existing = getFollow(id);
    if (existing) {
      return sendJson(res, 200, { follow: existing, created: false });
    }
    const subject = await getSubject(id);
    const follow = upsertFollow({
      subjectId: id,
      name: subject?.name ?? '',
      nameCn: subject?.nameCn ?? '',
      cover: subject?.cover ?? '',
      totalEps: subject?.totalEps ?? null,
      platform: subject?.platform ?? null,
      airDate: subject?.date ?? null,
      airWeekday: subject?.airWeekday ?? null,
      status: body.status ?? '在看',
      epWatched: Number(body.epWatched ?? 0),
      source: body.source ?? 'local',
    });
    startSync();
    return sendJson(res, 200, { follow, created: true });
  }

  if ((params = routeMatch('/api/follows/:id', pathname))) {
    const id = Number(params.id);
    if (method === 'PATCH' || method === 'PUT') {
      const body = await readJsonBody(req);
      const patch = {};
      if (body.status != null) patch.status = String(body.status);
      if (body.epWatched != null) patch.epWatched = Math.max(0, Number(body.epWatched) || 0);
      if (body.note != null) patch.note = String(body.note).slice(0, 500);
      if (body.airWeekday != null) patch.airWeekday = body.airWeekday === null ? null : Number(body.airWeekday);
      if (body.epWatched == null && body.status === '看过') {
        const card = followCard(getFollow(id) ?? {}, null, todayKey(getSettings().timezone || 'Asia/Shanghai'));
        if (card.totalEps) patch.epWatched = card.totalEps;
      }
      const follow = patchFollow(id, patch);
      if (!follow) return sendJson(res, 404, { error: '未找到该追番' });
      return sendJson(res, 200, { follow });
    }
    if (method === 'DELETE') {
      const removed = removeFollow(id);
      return sendJson(res, 200, { removed });
    }
  }

  if (method === 'POST' && (params = routeMatch('/api/follows/:id/progress', pathname))) {
    const id = Number(params.id);
    const body = await readJsonBody(req);
    const follow = getFollow(id);
    if (!follow) return sendJson(res, 404, { error: '未找到该追番' });
    const ep = Math.max(0, Number(body.ep ?? follow.epWatched + 1) || 0);
    const updated = patchFollow(id, { epWatched: ep });
    return sendJson(res, 200, { follow: updated });
  }

  if (method === 'POST' && pathname === '/api/import/bangumi') {
    const body = await readJsonBody(req);
    const username = String(body.username ?? getSettings().bgmUsername ?? '').trim();
    if (!username) return sendJson(res, 400, { error: '请填写 Bangumi 用户名' });
    const types = Array.isArray(body.types) && body.types.length ? body.types.map(Number) : [3, 1];
    const rows = await getUserCollections(username, { types });
    const statusMap = { 1: '想看', 2: '看过', 3: '在看', 4: '搁置', 5: '抛弃' };
    let added = 0;
    let skipped = 0;
    for (const row of rows) {
      const subject = row.subject;
      if (!subject?.subjectId) continue;
      if (getFollow(subject.subjectId)) {
        skipped += 1;
        continue;
      }
      upsertFollow({
        subjectId: subject.subjectId,
        name: subject.name,
        nameCn: subject.nameCn,
        cover: subject.cover,
        totalEps: subject.totalEps,
        platform: subject.platform,
        airDate: subject.date,
        airWeekday: subject.airWeekday,
        status: statusMap[row.type] ?? '在看',
        epWatched: row.epStatus || 0,
        source: 'bangumi',
      });
      added += 1;
    }
    if (username !== getSettings().bgmUsername) updateSettings({ bgmUsername: username });
    setMeta({ lastImportAt: Date.now() });
    startSync();
    return sendJson(res, 200, { added, skipped, total: rows.length, username });
  }

  if (pathname === '/api/settings') {
    if (method === 'GET') return sendJson(res, 200, { settings: getSettings() });
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJsonBody(req);
      const patch = {};
      if (typeof body.proxyUrl === 'string') patch.proxyUrl = body.proxyUrl.trim();
      if (typeof body.bgmUsername === 'string') patch.bgmUsername = body.bgmUsername.trim();
      if (typeof body.timezone === 'string' && ['Asia/Tokyo', 'Asia/Shanghai'].includes(body.timezone)) {
        patch.timezone = body.timezone;
      }
      if (typeof body.showHistoric === 'boolean') patch.showHistoric = body.showHistoric;
      if (typeof body.libraryAiringOnly === 'boolean') patch.libraryAiringOnly = body.libraryAiringOnly;
      const settings = updateSettings(patch);
      return sendJson(res, 200, { settings });
    }
  }

  if (method === 'POST' && pathname === '/api/sync') {
    const force = q.get('force') === '1';
    return sendJson(res, 200, { sync: startSync({ force }) });
  }

  if (method === 'POST' && pathname === '/api/cache/purge') {
    purgeCache();
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: `未知接口 ${method} ${pathname}` });
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  try {
    if (url.pathname === '/api/img') {
      const target = url.searchParams.get('u') ?? '';
      if (!isAllowedCover(target)) return sendJson(res, 400, { error: '封面地址非法' });
      try {
        const image = await getCover(target);
        res.writeHead(200, {
          'Content-Type': image.contentType,
          'Content-Length': image.buffer.length,
          'Cache-Control': 'public, max-age=604800',
        });
        res.end(image.buffer);
      } catch (error) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(`cover failed: ${error.message}`);
      }
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      if (process.env.ANIME_DAILY_LOG !== '0') {
        console.log(`[api] ${req.method} ${url.pathname}${url.search} ${res.statusCode} ${Date.now() - started}ms`);
      }
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res, url.pathname);
      return;
    }

    sendJson(res, 405, { error: 'method not allowed' });
  } catch (error) {
    console.error('[error]', req.method, url.pathname, error);
    if (!res.headersSent) sendJson(res, 500, { error: error.message ?? '服务器错误' });
    else res.end();
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n  [X] 端口 ${PORT} 已被占用——多半是已经有一个 AnimeDaily 在运行。`);
    console.error(`      直接打开 http://127.0.0.1:${PORT} 即可；`);
    console.error(`      想换端口：set PORT=8788 && node server\\index.mjs\n`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  const lans = LAN_ENABLED ? lanAddresses() : [];
  console.log('\n  AnimeDaily 已启动');
  console.log(`  本机访问    http://127.0.0.1:${PORT}`);
  if (lans.length) {
    for (const lan of lans) console.log(`  手机/平板   http://${lan.address}:${PORT}     （${lan.name}，同一 Wi-Fi 下）`);
    console.log('  手机首次打不开多半是 Windows 防火墙拦了，见 README「手机访问」一节');
  }
  console.log(`  数据目录    ${DATA_DIR}`);
  console.log('');
  prepare();
});

async function prepare() {
  try {
    const settings = getSettings();
    const tz = settings.timezone || 'Asia/Shanghai';
    console.log(`[init] 时区 ${tz} · 今日 ${todayKey(tz)} · 代理 ${settings.proxyUrl || '(直连)'}`);
    const probe = await probeNetwork();
    console.log(`[init] 代理连通: ${probe.proxy.ok ? `是 (${probe.proxy.ms}ms)` : `否 ${probe.proxy.error ?? ''}`} · 直连: ${probe.direct.ok ? '是' : '否'}`);
    const calendar = await getCalendar();
    const total = (calendar.days ?? []).reduce((sum, d) => sum + (d.items?.length ?? 0), 0);
    console.log(`[init] 每日放送 ${total} 部（${calendar.stale ? '缓存' : '已更新'}）`);
    const weekday = weekdayOfKey(todayKey(tz));
    const todayItems = (calendar.days ?? []).find((d) => d.weekday === weekday)?.items ?? [];
    const coversById = new Map();
    for (const day of calendar.days ?? []) for (const item of day.items ?? []) coversById.set(item.subjectId, item.cover);
    const followCovers = listFollows().map((f) => coversById.get(f.subjectId) || f.cover);
    prewarmCovers([...todayItems.map((i) => i.cover), ...followCovers]);
    if (listFollows().length) startSync();
  } catch (error) {
    console.error('[init] 预热失败（可忽略，接口会重试）:', error.message);
  }
}
