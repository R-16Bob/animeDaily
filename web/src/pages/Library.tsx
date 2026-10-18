import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Follow, FollowStatus, TodayPayload } from '../lib/types';
import { progressPercent, progressText, title as pickTitle } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { LibraryRow, PosterCard } from '../components/cards';
import { Badge, EmptyState, ErrorNote, PageTitle, ProgressBar, SectionHeader, Skeleton, Spinner } from '../components/ui';

type PageProps = {
  onOpen: (subjectId: number) => void;
  onChanged: () => void;
  notify: (text: string, tone?: 'info' | 'success' | 'error') => void;
  revision: number;
  follows: Set<number>;
  goDiscover: () => void;
};

type Filter = '全部' | FollowStatus;
type SortKey = 'today' | 'recent' | 'name';

const FILTERS: Filter[] = ['全部', '在看', '想看', '看过', '搁置', '抛弃'];

/** 中文字符串的 localeCompare 排序不可靠，这里显式定权重 */
const STATUS_RANK: Record<FollowStatus, number> = { 在看: 0, 想看: 1, 看过: 2, 搁置: 3, 抛弃: 4 };

export function LibraryPage({ onOpen, onChanged, notify, revision, goDiscover }: PageProps) {
  const followsQuery = useAsync(() => api.follows(), [revision], { pollMs: 90_000 });
  const todayQuery = useAsync<TodayPayload>(() => api.today(), [revision]);
  const settingsQuery = useAsync(() => api.settings(), []);
  const [filter, setFilter] = useState<Filter>('全部');
  const [sort, setSort] = useState<SortKey>('today');
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [airingOnly, setAiringOnly] = useState<boolean | null>(null);

  // 默认只看放送中（设置里记住选择）
  useEffect(() => {
    if (airingOnly === null && settingsQuery.data) {
      setAiringOnly(settingsQuery.data.settings.libraryAiringOnly ?? true);
    }
  }, [airingOnly, settingsQuery.data]);

  const onlyAiring = airingOnly ?? true;

  const today = todayQuery.data?.date ?? '';

  const follows = followsQuery.data?.follows ?? [];

  /** 当前筛选口径下的基数：开启「只看放送中」后，状态计数与列表都按连载中的作品算 */
  const base = useMemo(
    () => (onlyAiring ? follows.filter((item) => item.airing) : follows),
    [follows, onlyAiring],
  );
  const hidden = follows.length - base.length;

  const toggleAiringOnly = async () => {
    const next = !onlyAiring;
    setAiringOnly(next);
    try {
      await api.saveSettings({ libraryAiringOnly: next });
    } catch (err) {
      notify(err instanceof Error ? err.message : '保存偏好失败', 'error');
      setAiringOnly(!next);
    }
  };

  const counts = useMemo(() => {
    const map = new Map<Filter, number>([['全部', base.length]]);
    for (const status of FILTERS.slice(1) as FollowStatus[]) {
      map.set(status, base.filter((item) => item.status === status).length);
    }
    return map;
  }, [base]);

  const visible = useMemo(() => {
    const list = base.filter((item) => filter === '全部' || item.status === filter);
    const sorted = [...list];
    if (sort === 'today') {
      sorted.sort(
        (a, b) =>
          Number(b.pending) - Number(a.pending) ||
          Number(b.todayEp != null) - Number(a.todayEp != null) ||
          Number(b.airing) - Number(a.airing) ||
          (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
          pickTitle(a).localeCompare(pickTitle(b), 'zh-Hans-CN'),
      );
    } else if (sort === 'recent') {
      sorted.sort((a, b) => (b.lastEp?.airdate ?? '').localeCompare(a.lastEp?.airdate ?? ''));
    } else {
      sorted.sort((a, b) => pickTitle(a).localeCompare(pickTitle(b), 'zh-Hans-CN'));
    }
    return sorted;
  }, [base, filter, sort]);

  const step = async (follow: Follow, next: number) => {
    setBusyId(follow.subjectId);
    try {
      await api.progress(follow.subjectId, Math.max(0, next));
      notify(`《${pickTitle(follow)}》更新到第 ${Math.max(0, next)} 话`, 'success');
      onChanged();
      followsQuery.reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : '更新失败', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (followsQuery.loading && !followsQuery.data) {
    return (
      <div className="page">
        <PageTitle kicker="LIBRARY" title="我的追番" />
        <div className="lib-list">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} height={96} radius={14} />
          ))}
        </div>
      </div>
    );
  }

  if (followsQuery.error && !followsQuery.data) {
    return (
      <div className="page">
        <PageTitle kicker="LIBRARY" title="我的追番" />
        <ErrorNote message={followsQuery.error} onRetry={followsQuery.reload} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageTitle
        kicker="LIBRARY"
        title="我的追番"
        subtitle={
          follows.length
            ? (
              <>
                共 {follows.length} 部 · 放送中 {follows.filter((f) => f.airing).length} 部 · 在看{' '}
                {follows.filter((f) => f.status === '在看').length} 部 · 今日更新{' '}
                {follows.filter((f) => f.status === '在看' && f.todayEp != null).length} 部
                {onlyAiring && hidden > 0 ? <span className="dim">（已隐藏 {hidden} 部已完结/未开播）</span> : null}
              </>
            )
            : '这里会记录你追的每一部动画、看到第几话、下一话什么时候来'
        }
      />

      {follows.length === 0 ? (
        <EmptyState
          title="追番列表还是空的"
          description="去「发现」里搜一部加进来，或者在设置里一键导入 Bangumi 的公开收藏。"
          action={
            <button type="button" className="btn btn--accent" onClick={goDiscover}>
              去发现
            </button>
          }
        />
      ) : (
        <>
          <div className="toolbar">
            <div className="tabs">
              {FILTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={filter === item ? 'is-active' : ''}
                  onClick={() => setFilter(item)}
                >
                  {item}
                  <span className="tabs__count">{counts.get(item) ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="toolbar__right">
              <label className="switch switch--compact" title="只显示正在放送的作品">
                <input type="checkbox" checked={onlyAiring} onChange={() => void toggleAiringOnly()} />
                <span className="switch__track" aria-hidden />
                <span>只看放送中</span>
              </label>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="select">
                <option value="today">今日更新优先</option>
                <option value="recent">最近更新</option>
                <option value="name">按名称</option>
              </select>
              <div className="view-toggle">
                <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')} title="列表">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                  </svg>
                </button>
                <button type="button" className={view === 'grid' ? 'is-active' : ''} onClick={() => setView('grid')} title="网格">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <rect x="4" y="4" width="7" height="7" rx="1.6" />
                    <rect x="13" y="4" width="7" height="7" rx="1.6" />
                    <rect x="4" y="13" width="7" height="7" rx="1.6" />
                    <rect x="13" y="13" width="7" height="7" rx="1.6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {visible.length === 0 ? (
            base.length === 0 && onlyAiring ? (
              <EmptyState
                title="当前没有正在放送的番"
                description={`你追的 ${follows.length} 部里都已完结或还没开播。想看完整列表可以关掉「只看放送中」`}
                action={
                  <button type="button" className="btn btn--ghost" onClick={() => void toggleAiringOnly()}>
                    显示全部追番
                  </button>
                }
              />
            ) : (
              <EmptyState
                title={`没有「${filter}」状态的番`}
                description={onlyAiring ? '切换筛选，或关掉「只看放送中」看看全部。' : '切换上面的筛选看看。'}
              />
            )
          ) : view === 'list' ? (
            <div className="lib-list">
              {visible.map((follow) => (
                <LibraryRow
                  key={follow.subjectId}
                  follow={follow}
                  today={today}
                  busy={busyId === follow.subjectId}
                  onOpen={() => onOpen(follow.subjectId)}
                  onWatched={() => void step(follow, follow.epWatched + 1)}
                />
              ))}
            </div>
          ) : (
            <div className="poster-grid">
              {visible.map((follow) => (
                <PosterCard
                  key={follow.subjectId}
                  item={{
                    ...follow,
                    ep: follow.lastEp?.ep ?? null,
                    rating: null,
                    doing: null,
                    tags: [],
                    summary: '',
                    date: follow.airDate,
                  }}
                  followed
                  onOpen={() => onOpen(follow.subjectId)}
                  onFollow={() => undefined}
                  footer={
                    <div className="poster__library">
                      <div className="poster__library-top">
                        <Badge tone={follow.pending ? 'mint' : 'default'}>{follow.status}</Badge>
                        <span className="dim tiny">{progressText(follow.epWatched, follow.totalEps)}</span>
                      </div>
                      <ProgressBar value={progressPercent(follow.epWatched, follow.totalEps)} />
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm btn--full"
                        onClick={(event) => {
                          event.stopPropagation();
                          void step(follow, follow.epWatched + 1);
                        }}
                        disabled={busyId === follow.subjectId}
                      >
                        {busyId === follow.subjectId ? <Spinner size={12} /> : '看 +1'}
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {followsQuery.data?.sync.running ? (
        <p className="dim tiny" style={{ marginTop: 18 }}>
          <Spinner size={11} /> 正在同步逐话放送日期 {followsQuery.data.sync.done}/{followsQuery.data.sync.total}
        </p>
      ) : null}
    </div>
  );
}
