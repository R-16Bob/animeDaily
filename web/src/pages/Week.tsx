import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { epLabel, title as pickTitle } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Cover, ErrorNote, PageTitle, SectionHeader, Skeleton, Spinner } from '../components/ui';

type PageProps = {
  onOpen: (subjectId: number) => void;
  revision: number;
  follows: Set<number>;
};

export function WeekPage({ onOpen, revision, follows }: PageProps) {
  const { data, error, loading, reload } = useAsync(() => api.week(), [revision], { pollMs: 5 * 60 * 1000 });
  const [onlyFollowed, setOnlyFollowed] = useState(false);

  const days = useMemo(() => {
    if (!data) return [];
    return data.days.map((day) => ({
      ...day,
      items: onlyFollowed ? day.items.filter((item) => follows.has(item.subjectId)) : day.items,
    }));
  }, [data, onlyFollowed, follows]);

  if (loading && !data) {
    return (
      <div className="page">
        <PageTitle kicker="WEEK" title="周历" subtitle="正在读取本周放送表…" />
        <div className="week-grid">
          {Array.from({ length: 7 }).map((_, index) => (
            <div className="week-col" key={index}>
              <Skeleton height={44} radius={10} />
              <Skeleton height={64} radius={10} />
              <Skeleton height={64} radius={10} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="page">
        <PageTitle kicker="WEEK" title="周历" />
        <ErrorNote message={error} onRetry={reload} />
      </div>
    );
  }

  if (!data) return null;

  const total = data.days.reduce((sum, day) => sum + day.items.length, 0);
  const mine = data.days.reduce((sum, day) => sum + day.items.filter((item) => follows.has(item.subjectId)).length, 0);

  return (
    <div className="page page--wide">
      <PageTitle
        kicker="WEEK"
        title="本周放送表"
        subtitle={
          <>
            {data.days[0]?.displayDate} – {data.days[data.days.length - 1]?.displayDate} · 共 <strong>{total}</strong> 部 ·
            我追的 <strong>{mine}</strong> 部
          </>
        }
      />

      <SectionHeader
        title="七天一览"
        hint={data.calendarStale ? '缓存数据' : undefined}
        right={
          <label className="switch">
            <input type="checkbox" checked={onlyFollowed} onChange={(event) => setOnlyFollowed(event.target.checked)} />
            <span className="switch__track" aria-hidden />
            <span>只看我追的</span>
          </label>
        }
      />

      <div className="week-grid">
        {days.map((day) => (
          <div key={day.weekday} className={`week-col ${day.isToday ? 'is-today' : ''}`}>
            <div className="week-col__head">
              <span className="week-col__day">周{day.short}</span>
              <span className="week-col__date">{day.displayDate.replace('月', '/').replace('日', '')}</span>
              <span className="week-col__count">{day.items.length}</span>
            </div>
            <div className="week-col__body">
              {day.items.length === 0 ? (
                <p className="week-empty">今天没有放送</p>
              ) : (
                day.items.map((item) => {
                  const mineItem = follows.has(item.subjectId);
                  return (
                    <button
                      key={item.subjectId}
                      type="button"
                      className={`week-item ${mineItem ? 'is-mine' : ''}`}
                      onClick={() => onOpen(item.subjectId)}
                      title={pickTitle(item)}
                    >
                      <Cover url={item.cover} name={pickTitle(item)} ratio="3 / 4" className="week-item__cover" />
                      <span className="week-item__text">
                        <span className="week-item__name">{pickTitle(item)}</span>
                        <span className="week-item__meta">
                          {epLabel(item.ep) ?? '特别篇'}
                          {mineItem ? <em>在追</em> : null}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {data.sync.running ? (
        <p className="dim tiny" style={{ marginTop: 16 }}>
          <Spinner size={11} /> 正在补齐追番的逐话日期 {data.sync.done}/{data.sync.total}
        </p>
      ) : null}
    </div>
  );
}
