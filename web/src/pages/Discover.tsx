import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { ScheduleItem } from '../lib/types';
import { title as pickTitle } from '../lib/format';
import { useAsync, useDebounced } from '../lib/useAsync';
import { PosterCard } from '../components/cards';
import { EmptyState, ErrorNote, PageTitle, PosterSkeletons, SectionHeader, Spinner } from '../components/ui';

type PageProps = {
  onOpen: (subjectId: number) => void;
  onChanged: () => void;
  notify: (text: string, tone?: 'info' | 'success' | 'error') => void;
  revision: number;
  follows: Set<number>;
};

export function DiscoverPage({ onOpen, onChanged, notify, revision, follows }: PageProps) {
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [seasonSort, setSeasonSort] = useState<'doing' | 'rating'>('doing');
  const debounced = useDebounced(query.trim(), 350);

  const search = useAsync(() => (debounced ? api.search(debounced) : Promise.resolve(null)), [debounced, revision]);
  const season = useAsync(() => api.week(), [revision]);

  const seasonItems = useMemo<ScheduleItem[]>(() => {
    const map = new Map<number, ScheduleItem>();
    for (const day of season.data?.days ?? []) {
      for (const item of day.items) {
        if (!map.has(item.subjectId)) map.set(item.subjectId, item);
      }
    }
    const list = [...map.values()];
    list.sort((a, b) =>
      seasonSort === 'doing' ? (b.doing ?? 0) - (a.doing ?? 0) : (b.rating ?? 0) - (a.rating ?? 0),
    );
    return list;
  }, [season.data, seasonSort]);

  const addFollow = async (subjectId: number, name: string) => {
    setBusyId(subjectId);
    try {
      await api.addFollow(subjectId, '在看');
      notify(`已加入追番：${name}`, 'success');
      onChanged();
      search.reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : '加入失败', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const searching = Boolean(debounced);
  const results = search.data?.items ?? [];
  const loadingSearch = search.loading && searching && !search.data;

  return (
    <div className="page">
      <PageTitle
        kicker="DISCOVER"
        title="发现新番"
        subtitle="搜索 Bangumi 全站动画条目，或从本季放送中挑一部"
      />

      <div className="searchbar">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入中文名 / 日文名，例如：芙莉莲"
          spellCheck={false}
          autoComplete="off"
        />
        {query ? (
          <button type="button" className="searchbar__clear" onClick={() => setQuery('')} aria-label="清空">
            ×
          </button>
        ) : null}
        {search.loading && searching ? <Spinner size={14} /> : null}
      </div>

      {searching ? (
        <section className="block">
          <SectionHeader
            title="搜索结果"
            hint={search.data ? `${search.data.total} 条匹配` : undefined}
          />
          {loadingSearch ? (
            <PosterSkeletons count={8} />
          ) : search.error ? (
            <ErrorNote message={search.error} onRetry={search.reload} />
          ) : results.length === 0 ? (
            <EmptyState title="没有找到匹配的动画" description="换个关键词试试，比如只用作品名的一部分。" />
          ) : (
            <div className="poster-grid">
              {results.map((item) => (
                <PosterCard
                  key={item.subjectId}
                  item={item}
                  followed={follows.has(item.subjectId)}
                  busy={busyId === item.subjectId}
                  onOpen={() => onOpen(item.subjectId)}
                  onFollow={() => void addFollow(item.subjectId, pickTitle(item))}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="block">
          <SectionHeader
            title="本季放送中"
            hint={seasonItems.length ? `${seasonItems.length} 部` : undefined}
            right={
              <div className="segmented segmented--sm">
                <button type="button" className={seasonSort === 'doing' ? 'is-active' : ''} onClick={() => setSeasonSort('doing')}>
                  关注度
                </button>
                <button type="button" className={seasonSort === 'rating' ? 'is-active' : ''} onClick={() => setSeasonSort('rating')}>
                  评分
                </button>
              </div>
            }
          />
          {season.loading && !season.data ? (
            <PosterSkeletons count={12} />
          ) : season.error ? (
            <ErrorNote message={season.error} onRetry={season.reload} />
          ) : (
            <div className="poster-grid">
              {seasonItems.map((item) => (
                <PosterCard
                  key={item.subjectId}
                  item={item}
                  followed={follows.has(item.subjectId)}
                  busy={busyId === item.subjectId}
                  onOpen={() => onOpen(item.subjectId)}
                  onFollow={() => void addFollow(item.subjectId, pickTitle(item))}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
