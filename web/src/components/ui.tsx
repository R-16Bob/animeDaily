import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { coverUrl } from '../lib/api';
import { title as pickTitle } from '../lib/format';

/* ------------------------------------------------------------------ 封面 */

export function Cover({
  url,
  name,
  ratio = '3 / 4',
  className = '',
  children,
}: {
  url?: string | null;
  name?: string;
  ratio?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const base = url ? coverUrl(url) : '';
  const src = base ? `${base}${base.includes('?') ? '&' : '?'}r=${attempt}` : '';
  const label = (name ?? '').trim().slice(0, 1) || '番';

  return (
    <div className={`cover ${className}`} style={{ '--ratio': ratio } as CSSProperties}>
      {src && !failed ? (
        <img
          src={src}
          alt={name ?? ''}
          loading="lazy"
          decoding="async"
          onError={() => {
            if (attempt < 2) {
              window.setTimeout(() => setAttempt((value) => value + 1), 900);
            } else {
              setFailed(true);
            }
          }}
        />
      ) : (
        <div className="cover__fallback" aria-hidden>
          <span>{label}</span>
        </div>
      )}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ 小组件 */

export function Badge({
  children,
  tone = 'default',
  title,
}: {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'mint' | 'violet' | 'warn' | 'muted';
  title?: string;
}) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'mint' | 'muted' }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="bar" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className={`bar__fill bar__fill--${tone}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="加载中" />;
}

export function Skeleton({ width, height, radius = 12 }: { width?: string | number; height?: number; radius?: number }) {
  return <div className="skeleton" style={{ width: width ?? '100%', height: height ?? 16, borderRadius: radius }} />;
}

export function PosterSkeletons({ count = 12 }: { count?: number }) {
  return (
    <div className="poster-grid">
      {Array.from({ length: count }).map((_, index) => (
        <div className="poster-skeleton" key={index}>
          <Skeleton height={210} radius={14} />
          <Skeleton height={12} radius={6} width="80%" />
          <Skeleton height={10} radius={6} width="50%" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon ? <div className="empty__icon">{icon}</div> : null}
      <p className="empty__title">{title}</p>
      {description ? <p className="empty__desc">{description}</p> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-note">
      <div>
        <strong>加载失败</strong>
        <p>{message}</p>
      </div>
      {onRetry ? (
        <button type="button" className="btn btn--ghost" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ 头部区块 */

export function SectionHeader({
  title,
  hint,
  right,
}: {
  title: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div className="section-head__main">
        <h2>{title}</h2>
        {hint ? <span className="section-head__hint">{hint}</span> : null}
      </div>
      {right ? <div className="section-head__right">{right}</div> : null}
    </div>
  );
}

export function SubjectMeta({
  rating,
  ep,
  doing,
  weekday,
  estimated,
}: {
  rating?: number | null;
  ep?: number | null;
  doing?: number | null;
  weekday?: string | null;
  estimated?: boolean;
}) {
  return (
    <div className="meta">
      {rating != null && rating > 0 ? (
        <span className="meta__rating">
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
            <path
              fill="currentColor"
              d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9z"
            />
          </svg>
          {rating.toFixed(1)}
        </span>
      ) : null}
      {ep != null && ep > 0 ? (
        <span className={estimated ? 'meta__ep meta__ep--estimated' : 'meta__ep'}>
          第 {ep} 话{estimated ? ' 预计' : ''}
        </span>
      ) : null}
      {weekday ? <span>{weekday}</span> : null}
      {doing ? <span>{doing >= 10000 ? `${(doing / 10000).toFixed(1)} 万人在看` : `${doing} 人在看`}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ 轻提示 */

export function Toasts({
  items,
  onDismiss,
}: {
  items: { id: number; text: string; tone: 'info' | 'success' | 'error' }[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((toast) => (
        <ToastItem key={toast.id} tone={toast.tone} text={toast.text} onDone={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ text, tone, onDone }: { text: string; tone: 'info' | 'success' | 'error'; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2600);
    return () => clearTimeout(timer);
  }, [onDone]);
  return <div className={`toast toast--${tone}`}>{text}</div>;
}

export function PageTitle({ kicker, title, subtitle }: { kicker?: string; title: string; subtitle?: ReactNode }) {
  return (
    <div className="page-title">
      {kicker ? <span className="page-title__kicker">{kicker}</span> : null}
      <h1>{title}</h1>
      {subtitle ? <p className="page-title__sub">{subtitle}</p> : null}
    </div>
  );
}

export function useTitleLabel(item: { nameCn?: string; name?: string }) {
  return pickTitle(item);
}
