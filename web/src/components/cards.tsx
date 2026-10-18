import type { ReactNode } from 'react';
import type { Follow, ScheduleItem } from '../lib/types';
import { epLabel, formattingCount, progressPercent, progressText, ratingText, relativeDay, title } from '../lib/format';
import { Badge, Cover, ProgressBar, Spinner } from './ui';

/* ------------------------------------------------------------------ 海报卡（放送表 / 搜索 / 追番网格） */

export function PosterCard({
  item,
  followed,
  busy,
  onOpen,
  onFollow,
  footer,
}: {
  item: ScheduleItem;
  followed: boolean;
  busy?: boolean;
  onOpen: () => void;
  onFollow: () => void;
  footer?: ReactNode;
}) {
  const name = title(item);
  const ep = epLabel(item.ep);

  return (
    <article
      className="poster"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <Cover url={item.cover} name={name} ratio="3 / 4" className="poster__cover">
        {ep ? <span className="poster__ep">{ep}</span> : null}
        {followed ? (
          <span className="poster__flag" title="已加入追番">
            已追
          </span>
        ) : null}
        <button
          type="button"
          className={`poster__follow ${followed ? 'is-followed' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            if (!followed) onFollow();
          }}
          disabled={busy || followed}
          title={followed ? '已在追番列表' : '加入追番'}
        >
          {busy ? <Spinner size={12} /> : followed ? '已加入' : '+ 追番'}
        </button>
      </Cover>
      <div className="poster__body">
        <h3 className="poster__title" title={name}>
          {name}
        </h3>
        <div className="poster__meta">
          {ratingText(item.rating) ? <span className="score">{ratingText(item.rating)}</span> : null}
          {item.doing ? <span className="dim">{formattingCount(item.doing)} 人关注</span> : null}
          {!item.rating && !item.doing ? <span className="dim">{item.platform ?? '动画'}</span> : null}
        </div>
        {footer}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ 今日更新卡 */

export function UpdateCard({
  follow,
  busy,
  onOpen,
  onWatched,
  today,
}: {
  follow: Follow;
  busy?: boolean;
  onOpen: () => void;
  onWatched: () => void;
  today: string;
}) {
  const name = title(follow);
  const ep = follow.todayEp ?? 0;
  const done = follow.epWatched >= ep;
  const next = follow.nextEp ? relativeDay(follow.nextEp.airdate, today) : null;

  return (
    <article className={`update-card ${done ? 'is-done' : ''}`}>
      <button type="button" className="update-card__cover" onClick={onOpen} aria-label={`查看 ${name}`}>
        <Cover url={follow.cover} name={name} ratio="3 / 4" />
      </button>

      <div className="update-card__body">
        <div className="update-card__head">
          <button type="button" className="update-card__title" onClick={onOpen}>
            {name}
          </button>
          {follow.todayEp ? (
            <Badge tone={follow.todayExact ? 'mint' : 'warn'} title={follow.todayExact ? '来自逐话放送日期' : '按放送星期推算'}>
              {epLabel(follow.todayEp)}
              {follow.todayExact ? '' : ' · 预计'}
            </Badge>
          ) : null}
        </div>

        <div className="update-card__meta">
          <span>{follow.airWeekdayLabel ?? '放送日未知'} 更新</span>
          <span className="dot-sep" />
          <span>{progressText(follow.epWatched, follow.totalEps)}</span>
          {next && !done ? (
            <>
              <span className="dot-sep" />
              <span>下话 {next}</span>
            </>
          ) : null}
        </div>

        <div className="update-card__progress">
          <ProgressBar value={progressPercent(follow.epWatched, follow.totalEps)} tone={done ? 'mint' : 'accent'} />
        </div>

        <div className="update-card__actions">
          <button
            type="button"
            className={`btn ${done ? 'btn--ghost' : 'btn--accent'} btn--sm`}
            onClick={onWatched}
            disabled={busy}
          >
            {busy ? <Spinner size={12} /> : done ? '已看 ✓' : `标记看到第 ${ep} 话`}
          </button>
          <button type="button" className="btn btn--plain btn--sm" onClick={onOpen}>
            详情
          </button>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ 追番列表行 */

export function LibraryRow({
  follow,
  busy,
  onOpen,
  onWatched,
  today,
}: {
  follow: Follow;
  busy?: boolean;
  onOpen: () => void;
  onWatched: () => void;
  today: string;
}) {
  const name = title(follow);
  const pending = follow.status === '在看' && follow.pending && follow.todayEp;
  const next = follow.nextEp ? relativeDay(follow.nextEp.airdate, today) : null;

  return (
    <div className={`lib-row ${pending ? 'is-pending' : ''}`}>
      <button type="button" className="lib-row__cover" onClick={onOpen} aria-label={`查看 ${name}`}>
        <Cover url={follow.cover} name={name} ratio="3 / 4" />
      </button>

      <div className="lib-row__main">
        <div className="lib-row__title-line">
          <button type="button" className="lib-row__title" onClick={onOpen}>
            {name}
          </button>
          <Badge tone={follow.status === '在看' ? 'accent' : follow.status === '看过' ? 'muted' : 'default'}>
            {follow.status}
          </Badge>
          {pending ? <Badge tone="mint">今日更新</Badge> : null}
        </div>
        <div className="lib-row__meta">
          {follow.airing ? (
            follow.airWeekdayLabel ? (
              <span>每周{follow.airWeekdayLabel.replace('周', '')}更新</span>
            ) : (
              <span>放送日未知</span>
            )
          ) : (
            <span className="lib-row__finished">已完结 · 非本季连载</span>
          )}
          {follow.lastEp ? (
            <>
              <span className="dot-sep" />
              <span>
                最新 第 {follow.lastEp.ep} 话
                {follow.lastEp.airdate ? ` · ${follow.lastEp.airdate.slice(5).replace('-', '/')}` : ''}
              </span>
            </>
          ) : null}
          {next ? (
            <>
              <span className="dot-sep" />
              <span>下话 {next}</span>
            </>
          ) : null}
        </div>
        <div className="lib-row__progress">
          <ProgressBar value={progressPercent(follow.epWatched, follow.totalEps)} tone={pending ? 'mint' : 'accent'} />
          <span className="lib-row__count">{progressText(follow.epWatched, follow.totalEps)}</span>
        </div>
      </div>

      <div className="lib-row__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onOpen}>
          管理
        </button>
        <button type="button" className="btn btn--accent btn--sm" onClick={onWatched} disabled={busy}>
          {busy ? <Spinner size={12} /> : '看 +1'}
        </button>
      </div>
    </div>
  );
}
