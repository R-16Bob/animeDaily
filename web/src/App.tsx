import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './lib/api';
import { useAsync } from './lib/useAsync';
import type { FollowsPayload } from './lib/types';
import { SubjectSheet } from './components/SubjectSheet';
import { Toasts } from './components/ui';
import { TodayPage } from './pages/Today';
import { WeekPage } from './pages/Week';
import { LibraryPage } from './pages/Library';
import { DiscoverPage } from './pages/Discover';
import { SettingsPage } from './pages/Settings';

type View = 'today' | 'week' | 'library' | 'discover' | 'settings';

const NAV: { key: View; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '周历' },
  { key: 'library', label: '追番' },
  { key: 'discover', label: '发现' },
];

type Toast = { id: number; text: string; tone: 'info' | 'success' | 'error' };

function viewFromHash(): View {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'week' || hash === 'library' || hash === 'discover' || hash === 'settings') return hash;
  return 'today';
}

export default function App() {
  const [view, setView] = useState<View>(viewFromHash);
  const [revision, setRevision] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [detailId, setDetailId] = useState<number | null>(null);
  const followsQuery = useAsync<FollowsPayload>(() => api.follows(), [revision], { pollMs: 30_000 });
  const todayQuery = useAsync(() => api.today(), [revision], { pollMs: 120_000 });

  const followIds = useMemo(
    () => new Set((followsQuery.data?.follows ?? []).map((item) => item.subjectId)),
    [followsQuery.data],
  );

  const notify = useCallback((text: string, tone: 'info' | 'success' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const bump = useCallback(() => setRevision((value) => value + 1), []);

  const navigate = useCallback((next: View) => {
    setView(next);
    setDetailId(null);
    if (window.location.hash !== `#${next}`) window.location.hash = next;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openSubject = useCallback((id: number) => {
    setDetailId(id);
    window.location.hash = `subject/${id}`;
  }, []);

  const closeSubject = useCallback(() => {
    setDetailId(null);
    window.location.hash = view;
  }, [view]);

  useEffect(() => {
    const onHash = () => {
      const raw = window.location.hash.replace(/^#/, '');
      if (raw.startsWith('subject/')) {
        const id = Number(raw.slice('subject/'.length));
        if (Number.isFinite(id) && id > 0) setDetailId(id);
        return;
      }
      setDetailId(null);
      if (raw === 'today' || raw === 'week' || raw === 'library' || raw === 'discover' || raw === 'settings') {
        setView(raw);
      }
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const sync = followsQuery.data?.sync;
  const today = todayQuery.data;

  const pageProps = {
    onOpen: openSubject,
    onChanged: bump,
    notify,
    revision,
    follows: followIds,
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.1">
              <path d="M12 3.5l2.2 5.3 5.3 2.2-5.3 2.2L12 18.5l-2.2-5.3L4.5 11l5.3-2.2z" strokeLinejoin="round" />
            </svg>
          </span>
          <span>AnimeDaily</span>
          <span className="brand__sub">追番日历</span>
        </div>

        <nav className="nav" aria-label="主导航">
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav__item ${view === item.key ? 'is-active' : ''}`}
              onClick={() => navigate(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="topbar__right">
          {sync?.running ? (
            <span className="sync-chip" title="正在补齐逐话放送日期">
              同步 {sync.done}/{sync.total}
            </span>
          ) : today ? (
            <span
              className="sync-chip sync-chip--info"
              title="今日放送数量"
              style={{ color: 'var(--muted)', borderColor: 'var(--line)', background: 'transparent' }}
            >
              今日 {today.stats.todayCount} 部在放送
            </span>
          ) : null}
          <button
            type="button"
            className={`icon-btn ${view === 'settings' ? 'is-active' : ''}`}
            onClick={() => navigate('settings')}
            aria-label="设置"
            title="设置"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.55V21a2 2 0 11-4 0v-.11a1.7 1.7 0 00-1.11-1.55 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-1.55-1H3a2 2 0 110-4h.11A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06A1.7 1.7 0 009 4.6h.05A1.7 1.7 0 0010 3.05V3a2 2 0 114 0v.11a1.7 1.7 0 001 1.55 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06A1.7 1.7 0 0019.4 9v.05a1.7 1.7 0 001.55 1H21a2 2 0 110 4h-.11a1.7 1.7 0 00-1.49 1z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="main">
        {view === 'today' ? (
          <TodayPage {...pageProps} goDiscover={() => navigate('discover')} goSettings={() => navigate('settings')} />
        ) : null}
        {view === 'week' ? <WeekPage {...pageProps} /> : null}
        {view === 'library' ? <LibraryPage {...pageProps} goDiscover={() => navigate('discover')} /> : null}
        {view === 'discover' ? <DiscoverPage {...pageProps} /> : null}
        {view === 'settings' ? <SettingsPage revision={revision} onChanged={bump} notify={notify} /> : null}
      </main>

      <footer className="footer">
        <span>AnimeDaily · 数据来自 Bangumi 公共 API，无需登录</span>
        <span>
          {today ? `${today.displayDate} ${today.weekdayLabel}` : ''} · 追番与进度仅存在本机
        </span>
      </footer>

      {detailId != null ? (
        <SubjectSheet
          subjectId={detailId}
          today={today?.date ?? new Date().toISOString().slice(0, 10)}
          onClose={closeSubject}
          onChanged={bump}
          notify={notify}
        />
      ) : null}

      <Toasts items={toasts} onDismiss={dismiss} />
    </div>
  );
}
