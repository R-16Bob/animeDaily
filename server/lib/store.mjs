import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, DEFAULT_PROXY, STORE_FILE } from './config.mjs';

const DEFAULT_STATE = {
  version: 1,
  settings: {
    proxyUrl: DEFAULT_PROXY,
    bgmUsername: '',
    // 面向国内使用习惯：默认按北京时间计日，而不是 Bangumi 的日本放送日
    timezone: 'Asia/Shanghai',
    showHistoric: false,
    // 追番列表默认只看正在放送的作品，避免历史番剧干扰日常使用
    libraryAiringOnly: true,
  },
  follows: [],
  meta: {
    lastImportAt: null,
    lastSyncAt: null,
  },
};

let state = null;

function normalize(raw) {
  const base = structuredClone(DEFAULT_STATE);
  if (!raw || typeof raw !== 'object') return base;
  const merged = {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings ?? {}) },
    meta: { ...base.meta, ...(raw.meta ?? {}) },
    follows: Array.isArray(raw.follows) ? raw.follows : [],
  };
  merged.follows = merged.follows
    .filter((f) => f && Number.isFinite(Number(f.subjectId)))
    .map((f) => ({
      subjectId: Number(f.subjectId),
      name: f.name ?? '',
      nameCn: f.nameCn ?? '',
      cover: f.cover ?? '',
      totalEps: f.totalEps ?? null,
      platform: f.platform ?? null,
      status: f.status ?? '在看',
      epWatched: Number(f.epWatched ?? 0),
      airWeekday: f.airWeekday ?? null,
      airDate: f.airDate ?? null,
      source: f.source ?? 'local',
      note: f.note ?? '',
      addedAt: f.addedAt ?? Date.now(),
      updatedAt: f.updatedAt ?? Date.now(),
    }));
  return merged;
}

export function loadState() {
  if (state) return state;
  try {
    state = normalize(JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')));
  } catch {
    state = normalize(null);
  }
  return state;
}

export function getState() {
  return loadState();
}

export function saveState() {
  const data = loadState();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = path.join(DATA_DIR, `.store.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, STORE_FILE);
  return data;
}

export function getSettings() {
  return loadState().settings;
}

export function updateSettings(patch) {
  const data = loadState();
  data.settings = { ...data.settings, ...patch };
  saveState();
  return data.settings;
}

export function listFollows() {
  return loadState().follows;
}

export function getFollow(subjectId) {
  return loadState().follows.find((f) => Number(f.subjectId) === Number(subjectId)) ?? null;
}

export function upsertFollow(entry) {
  const data = loadState();
  const id = Number(entry.subjectId);
  const index = data.follows.findIndex((f) => Number(f.subjectId) === id);
  const now = Date.now();
  if (index >= 0) {
    data.follows[index] = { ...data.follows[index], ...entry, subjectId: id, updatedAt: now };
  } else {
    data.follows.push({ status: '在看', epWatched: 0, source: 'local', note: '', addedAt: now, updatedAt: now, ...entry, subjectId: id });
  }
  saveState();
  return getFollow(id);
}

export function patchFollow(subjectId, patch) {
  const data = loadState();
  const item = data.follows.find((f) => Number(f.subjectId) === Number(subjectId));
  if (!item) return null;
  Object.assign(item, patch, { subjectId: Number(subjectId), updatedAt: Date.now() });
  saveState();
  return item;
}

export function removeFollow(subjectId) {
  const data = loadState();
  const before = data.follows.length;
  data.follows = data.follows.filter((f) => Number(f.subjectId) !== Number(subjectId));
  saveState();
  return before !== data.follows.length;
}

export function setMeta(patch) {
  const data = loadState();
  data.meta = { ...data.meta, ...patch };
  saveState();
  return data.meta;
}
