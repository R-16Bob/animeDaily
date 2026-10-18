import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR } from './config.mjs';

const memory = new Map();
const MAX_MEMORY = 400;

function fileFor(ns, key) {
  const safe = String(key).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return path.join(CACHE_DIR, ns, `${safe}.json`);
}

function memoryKey(ns, key) {
  return `${ns}::${key}`;
}

export function readAny(ns, key) {
  const mk = memoryKey(ns, key);
  if (memory.has(mk)) return memory.get(mk);
  const file = fileFor(ns, key);
  try {
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof entry?.ts !== 'number') return null;
    if (memory.size > MAX_MEMORY) memory.clear();
    memory.set(mk, entry);
    return entry;
  } catch {
    return null;
  }
}

export function writeEntry(ns, key, data) {
  const entry = { ts: Date.now(), data };
  memory.set(memoryKey(ns, key), entry);
  const file = fileFor(ns, key);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entry), 'utf8');
    fs.renameSync(tmp, file);
  } catch (error) {
    console.warn('[cache] 写入失败', ns, key, error.message);
  }
  return entry;
}

/**
 * 读缓存；过期或缺失时调用 producer 重新拉取。
 * 拉取失败但有旧数据时返回旧数据并标记 stale，保证断网也能看。
 */
export async function cached(ns, key, ttlMs, producer) {
  const entry = readAny(ns, key);
  const fresh = entry && Date.now() - entry.ts < ttlMs;
  if (fresh) return { data: entry.data, stale: false, age: Date.now() - entry.ts };
  try {
    const data = await producer();
    writeEntry(ns, key, data);
    return { data, stale: false, age: 0 };
  } catch (error) {
    if (entry) return { data: entry.data, stale: true, age: Date.now() - entry.ts, error: error.message };
    throw error;
  }
}

export function cacheStats() {
  const walk = (dir) => {
    let files = 0;
    let bytes = 0;
    let entries = [];
    try {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          const sub = walk(full);
          files += sub.files;
          bytes += sub.bytes;
          entries = entries.concat(sub.entries);
        } else {
          files += 1;
          bytes += stat.size;
          entries.push({ file: full, mtime: stat.mtimeMs, size: stat.size });
        }
      }
    } catch {
      /* ignore */
    }
    return { files, bytes, entries };
  };
  const { files, bytes } = walk(CACHE_DIR);
  return { files, bytes };
}

export function purgeCache() {
  memory.clear();
  try {
    for (const name of fs.readdirSync(CACHE_DIR)) {
      fs.rmSync(path.join(CACHE_DIR, name), { recursive: true, force: true });
    }
  } catch {
    /* ignore */
  }
}
