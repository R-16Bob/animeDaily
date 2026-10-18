import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Follow, FollowStatus, SubjectDetail } from '../lib/types';
import { STATUS_LIST } from '../lib/types';
import { epLabel, mdDate, ratingText, title as pickTitle } from '../lib/format';
import { Badge, Cover, ErrorNote, ProgressBar, Spinner } from './ui';

export function SubjectSheet({
  subjectId,
  today,
  onClose,
  onChanged,
  notify,
}: {
  subjectId: number;
  today: string;
  onClose: () => void;
  onChanged: () => void;
  notify: (text: string, tone?: 'info' | 'success' | 'error') => void;
}) {
  const [detail, setDetail] = useState<SubjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [watched, setWatched] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.subject(subjectId);
      setDetail(data);
      setWatched(data.follow?.epWatched ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const subject = detail?.subject;
  const follow = detail?.follow ?? null;
  const name = pickTitle(subject);

  const episodes = useMemo(() => {
    const list = [...(detail?.episodes ?? [])];
    list.sort((a, b) => (b.sort ?? b.ep) - (a.sort ?? a.ep));
    return list;
  }, [detail]);

  const totalEp = subject?.totalEps ?? (episodes.length ? episodes[0].ep : null);
  const todayEpisode = episodes.find((episode) => episode.airdate === today) ?? null;

  const mutateFollow = async (action: () => Promise<Follow | void>, successText: string) => {
    setBusy(true);
    try {
      await action();
      const refreshed = await api.subject(subjectId);
      setDetail(refreshed);
      setWatched(refreshed.follow?.epWatched ?? 0);
      onChanged();
      notify(successText, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const addFollow = () =>
    mutateFollow(async () => {
      await api.addFollow(subjectId, '在看');
    }, '已加入追番');

  const setStatus = (status: FollowStatus) =>
    mutateFollow(async () => {
      await api.patchFollow(subjectId, { status });
    }, `状态已改为「${status}」`);

  const setProgress = (value: number) =>
    mutateFollow(async () => {
      await api.progress(subjectId, Math.max(0, Math.min(value, totalEp ?? value)));
    }, `进度更新为 ${Math.max(0, value)} 话`);

  const removeFollow = () =>
    mutateFollow(async () => {
      await api.removeFollow(subjectId);
    }, '已移出追番');

  return (
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label={name}>
      <div className="sheet-backdrop" onClick={onClose} />
      <aside className="sheet">
        <button type="button" className="sheet__close" onClick={onClose} aria-label="关闭">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          </svg>
        </button>

        {loading ? (
          <div className="sheet__loading">
            <Spinner size={22} />
            <span>正在读取 Bangumi 条目…</span>
          </div>
        ) : error ? (
          <div className="sheet__loading">
            <ErrorNote message={error} onRetry={() => void load()} />
          </div>
        ) : (
          <div className="sheet__scroll">
            <div className="sheet__hero">
              {subject?.cover ? (
                <div className="sheet__bg" style={{ backgroundImage: `url(/api/img?u=${encodeURIComponent(subject.cover)})` }} />
              ) : null}
              <Cover url={subject?.cover ?? ''} name={name} ratio="3 / 4" className="sheet__cover" />
              <div className="sheet__intro">
                <h2>{name}</h2>
                {subject?.name && subject.name !== name ? <p className="sheet__jp">{subject.name}</p> : null}
                <div className="sheet__chips">
                  {ratingText(subject?.rating) ? <span className="chip chip--score">{ratingText(subject?.rating)} 分</span> : null}
                  {totalEp ? <span className="chip">{totalEp} 话</span> : null}
                  {detail?.weekday ? <span className="chip">周{['', '一', '二', '三', '四', '五', '六', '日'][detail.weekday]}更新</span> : null}
                  {subject?.platform ? <span className="chip">{subject.platform}</span> : null}
                  {subject?.date ? <span className="chip">{mdDate(subject.date)} 开播</span> : null}
                  {subject?.doing ? <span className="chip">{subject.doing} 人关注</span> : null}
                </div>
              </div>
            </div>

            {subject?.tags?.length ? (
              <div className="sheet__tags">
                {subject.tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            {subject?.summary ? (
              <div className="sheet__summary">
                <p className={expanded ? '' : 'is-clamped'}>{subject.summary}</p>
                {subject.summary.length > 120 ? (
                  <button type="button" className="link" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? '收起' : '展开简介'}
                  </button>
                ) : null}
              </div>
            ) : null}

            {follow ? (
              <div className="panel">
                <div className="panel__row panel__row--split">
                  <div>
                    <div className="panel__label">我的进度</div>
                    <div className="panel__value">
                      {watched} / {totalEp ?? '?'} 话
                      {todayEpisode ? <span className="panel__hint">今日更新 {epLabel(todayEpisode.ep)}</span> : null}
                    </div>
                  </div>
                  <div className="stepper">
                    <button
                      type="button"
                      onClick={() => setProgress(watched - 1)}
                      disabled={busy || watched <= 0}
                      aria-label="减一话"
                    >
                      −
                    </button>
                    <span>{watched}</span>
                    <button type="button" onClick={() => setProgress(watched + 1)} disabled={busy} aria-label="加一话">
                      +
                    </button>
                  </div>
                </div>
                <ProgressBar value={totalEp ? Math.min(100, Math.round((watched / totalEp) * 100)) : 0} />
                <div className="panel__actions">
                  {todayEpisode && watched < todayEpisode.ep ? (
                    <button type="button" className="btn btn--accent btn--sm" onClick={() => setProgress(todayEpisode.ep)} disabled={busy}>
                      看完今日更新
                    </button>
                  ) : null}
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setProgress(totalEp ?? watched)} disabled={busy}>
                    标记全看完
                  </button>
                  <button type="button" className="btn btn--plain btn--sm btn--danger" onClick={removeFollow} disabled={busy}>
                    移出追番
                  </button>
                </div>

                <div className="panel__label" style={{ marginTop: 18 }}>
                  追番状态
                </div>
                <div className="segmented">
                  {STATUS_LIST.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={follow.status === status ? 'is-active' : ''}
                      onClick={() => setStatus(status)}
                      disabled={busy}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                {follow.source === 'bangumi' ? <p className="panel__foot">该条目由 Bangumi 公开收藏导入</p> : null}
              </div>
            ) : (
              <div className="panel panel--cta">
                <div>
                  <div className="panel__label">还没追这部</div>
                  <p className="panel__value">加入后，放送日会出现在「今日更新」里。</p>
                </div>
                <button type="button" className="btn btn--accent" onClick={addFollow} disabled={busy}>
                  {busy ? <Spinner size={14} /> : '+ 加入追番'}
                </button>
              </div>
            )}

            <div className="sheet__episodes">
              <div className="section-head">
                <div className="section-head__main">
                  <h3>放送话数</h3>
                  <span className="section-head__hint">
                    {episodes.length ? `共 ${episodes.length} 话有日期记录` : '暂无逐话日期'}
                  </span>
                </div>
              </div>
              {episodes.length ? (
                <ul className="ep-list">
                  {episodes.slice(0, 40).map((episode) => {
                    const isToday = episode.airdate === today;
                    const isWatched = watched >= episode.ep;
                    return (
                      <li key={`${episode.ep}-${episode.airdate ?? 'na'}`} className={`ep ${isToday ? 'is-today' : ''}`}>
                        <span className="ep__no">第 {episode.ep} 话</span>
                        <span className="ep__name">{episode.nameCn || episode.name || '—'}</span>
                        <span className="ep__date">{episode.airdate ? mdDate(episode.airdate) : '日期未知'}</span>
                        {isToday ? <Badge tone="mint">今日</Badge> : null}
                        {isWatched && !isToday ? <span className="ep__watched">已看</span> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="dim">Bangumi 还没有这部作品的逐话放送日期。</p>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
