export const WEEKDAY_SHORT = ['', '一', '二', '三', '四', '五', '六', '日'];

export function title(item: { nameCn?: string; name?: string } | null | undefined): string {
  if (!item) return '未知作品';
  return item.nameCn?.trim() || item.name?.trim() || '未知作品';
}

export function ratingText(rating: number | null | undefined): string | null {
  if (rating == null || !Number.isFinite(rating) || rating <= 0) return null;
  return rating.toFixed(1);
}

export function epLabel(ep: number | null | undefined): string | null {
  if (ep == null || !Number.isFinite(ep) || ep <= 0) return null;
  return `第 ${ep} 话`;
}

export function progressText(watched: number, total: number | null): string {
  if (!total || total <= 0) return `已看 ${watched} 话`;
  return `${Math.min(watched, total)} / ${total} 话`;
}

export function progressPercent(watched: number, total: number | null): number {
  if (!total || total <= 0) return watched > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((watched / total) * 100)));
}

export function mdDate(date: string | null | undefined): string {
  if (!date) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return date;
  return `${Number(match[2])}月${Number(match[3])}日`;
}

export function relativeDay(date: string | null | undefined, today: string): string | null {
  if (!date) return null;
  const toUtc = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const diff = Math.round((toUtc(date) - toUtc(today)) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff > 1) return `${diff} 天后`;
  return `${-diff} 天前`;
}

export function formattingCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, '')} 万`;
  return String(value);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function statusTone(status: string): 'active' | 'wish' | 'done' | 'idle' | 'drop' {
  switch (status) {
    case '在看':
      return 'active';
    case '想看':
      return 'wish';
    case '看过':
      return 'done';
    case '抛弃':
      return 'drop';
    default:
      return 'idle';
  }
}
