import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';

export const DEFAULT_UA = 'AnimeDaily/0.1 (personal watchlist app; local use)';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 串行限速器：Bangumi 官方建议温和访问，默认 1.1s 间隔 */
export class Limiter {
  constructor(gap = 1100) {
    this.gap = gap;
    this.last = 0;
    this.chain = Promise.resolve();
  }
  run(fn) {
    const next = this.chain.then(async () => {
      const wait = this.last + this.gap - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        return await fn();
      } finally {
        this.last = Date.now();
      }
    });
    this.chain = next.catch(() => {});
    return next;
  }
}

export const bgmLimiter = new Limiter(1100);

function connectTunnel(proxyUrl, host, port, timeout) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: proxyUrl.hostname,
      port: proxyUrl.port || 80,
      method: 'CONNECT',
      path: `${host}:${port}`,
      headers: { Host: `${host}:${port}`, 'Proxy-Connection': 'Keep-Alive' },
      timeout,
    });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`proxy CONNECT ${res.statusCode}`));
        return;
      }
      resolve(socket);
    });
    req.on('timeout', () => req.destroy(new Error('proxy connect timeout')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * 每个 (代理, 目标主机) 复用一个 keep-alive Agent：
 * 建立 CONNECT 隧道 + TLS 握手很贵（经本地代理约 1~3s），复用到后续请求上几乎免费。
 */
const tunnelAgents = new Map();

function getTunnelAgent(proxyUrl, host, port, timeout) {
  const key = `${proxyUrl.host}:${proxyUrl.port}|${host}:${port}`;
  let agent = tunnelAgents.get(key);
  if (agent) return agent;

  agent = new https.Agent({ keepAlive: true, keepAliveMsecs: 20000, maxSockets: 3, maxFreeSockets: 2 });
  agent.createConnection = (options, callback) => {
    connectTunnel(proxyUrl, host, port, timeout)
      .then((socket) => {
        const tlsSocket = tls.connect({ socket, servername: host });
        const onError = (error) => {
          tlsSocket.destroy();
          callback(error);
        };
        tlsSocket.once('error', onError);
        tlsSocket.once('secureConnect', () => {
          tlsSocket.removeListener('error', onError);
          callback(null, tlsSocket);
        });
      })
      .catch((error) => callback(error));
    return undefined;
  };
  tunnelAgents.set(key, agent);
  return agent;
}

async function requestViaProxy(url, opts, proxyUrl) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error(`代理隧道仅支持 https: ${url}`);
  const port = Number(u.port) || 443;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        port,
        path: u.pathname + u.search,
        method: opts.method,
        headers: opts.headers,
        agent: getTunnelAgent(proxyUrl, u.hostname, port, opts.timeout),
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), via: 'proxy' }),
        );
      },
    );
    req.setTimeout(opts.timeout, () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function requestDirect(url, opts) {
  const res = await fetch(url, {
    method: opts.method,
    headers: opts.headers,
    body: opts.body,
    signal: AbortSignal.timeout(opts.timeout),
  });
  const body = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: Object.fromEntries(res.headers), body, via: 'direct' };
}

/**
 * 统一出口：优先走 HTTP 代理隧道（国内直连 api.bgm.tv / lain.bgm.tv 会被中断），
 * 失败自动重试，最后降级直连。
 */
export async function request(url, options = {}) {
  const opts = {
    method: 'GET',
    headers: {},
    timeout: 25000,
    retries: 3,
    body: undefined,
    proxyUrl: null,
    ...options,
  };
  let lastError;
  for (let attempt = 0; attempt < opts.retries; attempt++) {
    try {
      if (opts.proxyUrl) return await requestViaProxy(url, opts, opts.proxyUrl);
      return await requestDirect(url, opts);
    } catch (error) {
      lastError = error;
      await sleep(250 + attempt * 350);
    }
  }
  if (opts.proxyUrl) {
    try {
      return await requestDirect(url, opts);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('request failed');
}

export async function requestJson(url, options = {}) {
  const res = await request(url, options);
  const text = res.body.toString('utf8');
  if (res.status < 200 || res.status >= 300) {
    throw Object.assign(new Error(`HTTP ${res.status} ${url}`), { status: res.status, body: text.slice(0, 400) });
  }
  try {
    return { data: JSON.parse(text), via: res.via, status: res.status };
  } catch {
    throw new Error(`响应不是 JSON: ${text.slice(0, 200)}`);
  }
}

export function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function readJsonBody(req) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}

export function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}
