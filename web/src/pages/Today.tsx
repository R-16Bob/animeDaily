import { useState } from 'react';
import { api } from '../lib/api';
import type { Follow, UpcomingItem } from '../lib/types';
import { mdDate, relativeDay, title as pickTitle } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { PosterCard, UpdateCard } from '../components/cards';
import { Cover, EmptyState, ErrorNote, PageTitle, PosterSkeletons, SectionHeader, Spinner } from '../components/ui';

type PageProps = {
  onOpen: (subjectId: number) => void;
  onChanged: () => void;
  notify: (text: string, tone?: 'info' | 'success' | 'error') => void;
  revision: number;
  follows: Set<number>;
  goDiscover: () => void;
  goSettings: () => void;
};

export function TodayPage({ onOpen, onChanged, notify, revision, follows, goDiscover, goSettings }: PageProps) {
  const { data, error, loading, reload } = useAsync(() => api.today(), [revision], { pollMs: 60000 });
  const [busyId, setBusyId] = useState<number | null>(null);

  const addFollow = async (subjectId: number, name: string) => {
    setBusyId(subjectId);
    try {
      await api.addFollow(subjectId, '在看');
      notify(`已加入追番：${name}`, 'success');
      onChanged();
      reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : '加入失败', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const markWatched = async (follow: Follow) => {
    const target = follow.todayEp ?? follow.epWatched + 1;
    setBusyId(follow.subjectId);
    try {
      await api.progress(follow.subjectId, target);
      notify(`《${pickTitle(follow)}》进度更新到第 ${target} 话`, 'success');
      onChanged();
      reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : '更新失败', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="page">
        <PageTitle kicker="TODAY" title="今日放送" subtitle="正在读取 Bangumi 放送表…" />
        <div className="stat-row">
          {[0, 1, 2, 3].map((i) => (
            <div className="stat stat--skeleton" key={i} />
          ))}
        </div>
        <PosterSkeletons count={12} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="page">
        <PageTitle kicker="TODAY" title="今日放送" />
        <ErrorNote message={error} onRetry={reload} />
      </div>
    );
  }

  if (!data) return null;

  const updates = data.updates;
  const noneFollowed = data.stats.followedTotal === 0;

  return (
    <div className="page">
      <PageTitle
        kicker="TODAY"
        title={`${data.displayDate} · ${data.weekdayLabel}`}
        subtitle={
          <>
            按 <strong>{data.tz === 'Asia/Tokyo' ? '日本放送日' : '中国时间'}</strong> 计日 · 今日共{' '}
            <strong>{data.stats.todayCount}</strong> 部番剧放送
            {data.calendarStale ? <span className="warn-text"> · 当前为缓存数据</span> : null}
          </>
        }
      />

      <div className="stat-row">
        <StatCard label="今日放送" value={data.stats.todayCount} unit="部" />
        <StatCard label="我追的今日更新" value={data.stats.updatesToday} unit="部" tone="accent" />
        <StatCard label="待看" value={data.stats.pending} unit="话" tone={data.stats.pending > 0 ? 'mint' : 'plain'} />
        <StatCard label="追番总数" value={data.stats.followedTotal} unit="部" />
      </div>

      <section className="block">
        <SectionHeader
          title="我的番今天更新"
          hint={updates.length ? `${updates.length} 部` : undefined}
          right={
            data.sync.running ? (
              <span className="sync-chip">
                <Spinner size={11} /> 同步话数 {data.sync.done}/{data.sync.total}
              </span>
            ) : null
          }
        />

        {updates.length === 0 ? (
          noneFollowed ? (
            <EmptyState
              icon={<SparkIcon />}
              title="还没有追番"
              description="从 Bangumi 导入你公开的追番列表，或直接搜索添加，之后每天这里会告诉你更新到第几话。"
              action={
                <div className="btn-row">
                  <button type="button" className="btn btn--accent" onClick={goSettings}>
                    导入 Bangumi 收藏
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={goDiscover}>
                    去发现
                  </button>
                </div>
              }
            />
          ) : data.upcoming.length > 0 ? (
            <div className="upcoming-card">
              <p className="upcoming-card__lead">
                今天没有你的番更新{data.stats.airing ? `（还在连载 ${data.stats.airing} 部）` : ''}，接下来是：
              </p>
              <UpcomingList items={data.upcoming} today={data.date} onOpen={onOpen} />
            </div>
          ) : (
            <EmptyState
              icon={<MoonIcon />}
              title="今天没有你的番更新"
              description="你追的番里暂时没有在连载的作品，去本季放送表里挑一部加入吧。"
              action={
                <button type="button" className="btn btn--ghost" onClick={goDiscover}>
                  去找新番
                </button>
              }
            />
          )
        ) : (
          <div className="update-grid">
            {updates.map((follow) => (
              <UpdateCard
                key={follow.subjectId}
                follow={follow}
                today={data.date}
                busy={busyId === follow.subjectId}
                onOpen={() => onOpen(follow.subjectId)}
                onWatched={() => void markWatched(follow)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="block">
        <SectionHeader
          title="今日全部放送"
          hint={`${data.items.length} 部`}
          right={<span className="dim tiny hint-note">数据来源 · Bangumi 每日放送</span>}
        />
        {data.items.length === 0 ? (
          <EmptyState title="今天没有放送记录" description="Bangumi 今日放送表为空，可能是一天的淡季。" />
        ) : (
          <div className="poster-grid">
            {data.items.map((item) => (
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
    </div>
  );
}

function UpcomingList({
  items,
  today,
  onOpen,
}: {
  items: UpcomingItem[];
  today: string;
  onOpen: (subjectId: number) => void;
}) {
  return (
    <ul className="upcoming">
      {items.map((item) => {
        const label = relativeDay(item.airdate, today) ?? mdDate(item.airdate);
        const name = pickTitle(item);
        return (
          <li key={item.subjectId}>
            <button type="button" className="upcoming__row" onClick={() => onOpen(item.subjectId)}>
              <span className={`upcoming__when ${label === '今天' || label === '明天' ? 'is-soon' : ''}`}>
                <strong>{label}</strong>
                <small>{mdDate(item.airdate)}</small>
              </span>
              <Cover url={item.cover} name={name} ratio="3 / 4" className="upcoming__cover" />
              <span className="upcoming__body">
                <span className="upcoming__title">{name}</span>
                <span className="upcoming__meta">
                  {item.ep ? `第 ${item.ep} 话` : '新一话'}
                  {item.estimated ? ' · 预计' : ''}
                  {item.totalEps ? ` · 已看 ${item.epWatched}/${item.totalEps} 话` : item.epWatched ? ` · 已看 ${item.epWatched} 话` : ''}
                </span>
              </span>
              <span className="upcoming__arrow" aria-hidden>
                ›
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function StatCard({  label,
  value,
  unit,
  tone = 'plain',
}: {
  label: string;
  value: number;
  unit: string;
  tone?: 'plain' | 'accent' | 'mint';
}) {
  return (
    <div className={`stat stat--${tone}`}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">
        {value}
        <small>{unit}</small>
      </span>
    </div>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path
        d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M20 14.5A8.2 8.2 0 019.5 4 8.5 8.5 0 1020 14.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
