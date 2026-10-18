import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, '..', '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const COVER_DIR = path.join(DATA_DIR, 'covers');
export const STORE_FILE = path.join(DATA_DIR, 'store.json');
export const WEB_DIST = path.join(ROOT, 'web', 'dist');

export const PORT = Number(process.env.PORT || 8787);
// 绑定所有网卡，手机等同一 Wi-Fi 的设备才能访问；只想本机用可设 HOST=127.0.0.1
export const HOST = process.env.HOST || '0.0.0.0';
export const LAN_ENABLED = HOST === '0.0.0.0' || HOST === '::';

/** 虚拟网卡（Hyper-V / VMware / VPN 等）的地址通常不是手机能访问的那个 */
const VIRTUAL_IFACE = /(vEthernet|VMware|VirtualBox|Hyper-V|Loopback|TAP-|TUN|WSL|npcap|Radmin|VPN|Tailscale|ZeroTier|Clash|Mihomo)/i;

/** 本机局域网 IPv4 地址列表：优先物理网卡，家里常用的 192.168 / 10 / 172.16-31 排前面 */
export function lanAddresses() {
  const all = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family !== 'IPv4' || item.internal) continue;
      all.push({ name, address: item.address, virtual: VIRTUAL_IFACE.test(name) });
    }
  }
  const rank = (ip) => {
    if (ip.startsWith('192.168.')) return 0;
    if (ip.startsWith('10.')) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
    return 5;
  };
  const usable = all.filter((item) => !item.address.startsWith('169.254.'));
  const physical = usable.filter((item) => !item.virtual);
  return (physical.length ? physical : usable).sort((a, b) => rank(a.address) - rank(b.address));
}

export const BGM_API = 'https://api.bgm.tv';
export const DEFAULT_PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7890';

export const CACHE_TTL = {
  calendar: 60 * 60 * 1000, // 1 小时
  subject: 7 * 24 * 60 * 60 * 1000, // 7 天
  episodes: 12 * 60 * 60 * 1000, // 12 小时
  search: 10 * 60 * 1000, // 10 分钟
  collections: 30 * 60 * 1000, // 30 分钟
};

export function ensureDirs() {
  for (const dir of [DATA_DIR, CACHE_DIR, COVER_DIR]) fs.mkdirSync(dir, { recursive: true });
}
