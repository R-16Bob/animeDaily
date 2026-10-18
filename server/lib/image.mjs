import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { COVER_DIR } from './config.mjs';
import { request } from './util.mjs';
import { getSettings } from './store.mjs';

const ALLOWED = /(^|\.)bgm\.tv$/i;
const failCache = new Map();

/** 限制同时走代理下载的图片数量，避免把本地代理打满导致失败 */
const MAX_CONCURRENT = 4;
let active = 0;
const waiting = [];

function acquire() {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else active -= 1;
}

function coverPath(hash) {
  for (const ext of ['jpg', 'png', 'webp', 'gif']) {
    const file = path.join(COVER_DIR, `${hash}.${ext}`);
    if (fs.existsSync(file)) return { file, contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
  }
  return null;
}

function proxyUrl() {
  try {
    return getSettings().proxyUrl ? new URL(getSettings().proxyUrl) : null;
  } catch {
    return null;
  }
}

const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export function isAllowedCover(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && ALLOWED.test(u.hostname);
  } catch {
    return false;
  }
}

/** 封面中转 + 落盘缓存：Bangumi 图床直连被墙，且二次访问零延迟 */
export async function getCover(rawUrl) {
  if (!isAllowedCover(rawUrl)) throw new Error('封面域名不在白名单内');
  const url = rawUrl.replace(/^http:\/\//i, 'https://');
  const hash = crypto.createHash('sha1').update(url).digest('hex');

  const cached = coverPath(hash);
  if (cached) return { buffer: fs.readFileSync(cached.file), contentType: cached.contentType, cached: true };

  const failedAt = failCache.get(url);
  if (failedAt && Date.now() - failedAt < 10 * 60 * 1000) throw new Error('图片暂时不可用');

  await acquire();
  try {
    const res = await request(url, {
      proxyUrl: proxyUrl(),
      timeout: 25000,
      retries: 2,
      headers: { 'User-Agent': 'AnimeDaily/0.1', Accept: 'image/*', 'Accept-Encoding': 'identity' },
    });
    if (res.status !== 200) throw new Error(`图片 HTTP ${res.status}`);
    const contentType = String(res.headers['content-type'] ?? 'image/jpeg').split(';')[0];
    if (!contentType.startsWith('image/')) throw new Error(`图片类型异常 ${contentType}`);
    const ext = EXT_BY_TYPE[contentType] ?? 'jpg';
    fs.mkdirSync(COVER_DIR, { recursive: true });
    fs.writeFileSync(path.join(COVER_DIR, `${hash}.${ext}`), res.body);
    return { buffer: res.body, contentType, cached: false };
  } catch (error) {
    failCache.set(url, Date.now());
    throw error;
  } finally {
    release();
  }
}

/** 后台预热：首屏封面提前落盘，之后打开秒开 */
export function prewarmCovers(urls, { concurrency = 2, delay = 150 } = {}) {
  const list = [...new Set(urls.filter((u) => typeof u === 'string' && u.length > 0))];
  if (!list.length) return;
  (async () => {
    let index = 0;
    const worker = async () => {
      while (index < list.length) {
        const url = list[index];
        index += 1;
        try {
          await getCover(url);
        } catch {
          /* 预热失败不影响主流程 */
        }
        await new Promise((r) => setTimeout(r, delay));
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  })().catch(() => {});
}

export function coverStats() {
  try {
    const files = fs.readdirSync(COVER_DIR);
    let bytes = 0;
    for (const f of files) bytes += fs.statSync(path.join(COVER_DIR, f)).size;
    return { files: files.length, bytes };
  } catch {
    return { files: 0, bytes: 0 };
  }
}
