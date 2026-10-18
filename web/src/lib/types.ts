export type Subject = {
  subjectId: number;
  name: string;
  nameCn: string;
  cover: string;
  date: string | null;
  airWeekday: number | null;
  platform: string | null;
  totalEps: number | null;
  rating: number | null;
  doing: number | null;
  tags: string[];
  summary: string;
};

export type ScheduleItem = Subject & {
  ep: number | null;
  followed: boolean;
};

export type EpisodeRef = {
  ep: number;
  airdate: string | null;
  name: string;
  nameCn?: string;
  sort?: number;
  id?: number;
};

export type Follow = {
  subjectId: number;
  name: string;
  nameCn: string;
  cover: string;
  status: FollowStatus;
  epWatched: number;
  note: string;
  totalEps: number | null;
  platform: string | null;
  airWeekday: number | null;
  airWeekdayLabel: string | null;
  airDate: string | null;
  source: 'local' | 'bangumi';
  addedAt: number;
  updatedAt: number;
  episodesKnown: number;
  airing: boolean;
  todayEp: number | null;
  todayExact: boolean;
  pending: boolean;
  lastEp: EpisodeRef | null;
  nextEp: EpisodeRef | null;
  stale: boolean;
};

export type FollowStatus = '在看' | '想看' | '看过' | '搁置' | '抛弃';

export const STATUS_LIST: FollowStatus[] = ['在看', '想看', '看过', '搁置', '抛弃'];

export type SyncState = { running: boolean; done: number; total: number };

export type UpcomingItem = {
  subjectId: number;
  name: string;
  nameCn: string;
  cover: string;
  ep: number | null;
  airdate: string;
  estimated: boolean;
  airWeekdayLabel: string | null;
  epWatched: number;
  totalEps: number | null;
};

export type TodayPayload = {
  date: string;
  weekday: number;
  weekdayLabel: string;
  displayDate: string;
  tz: string;
  calendarStale: boolean;
  calendarAge: number;
  stats: {
    todayCount: number;
    followedTotal: number;
    updatesToday: number;
    pending: number;
    watching: number;
    airing: number;
  };
  updates: Follow[];
  upcoming: UpcomingItem[];
  items: ScheduleItem[];
  sync: SyncState;
};

export type WeekDay = {
  date: string;
  weekday: number;
  label: string;
  short: string;
  displayDate: string;
  isToday: boolean;
  items: ScheduleItem[];
};

export type WeekPayload = {
  today: string;
  tz: string;
  days: WeekDay[];
  calendarStale: boolean;
  sync: SyncState;
};

export type FollowsPayload = {
  follows: Follow[];
  stats: {
    total: number;
    watching: number;
    wish: number;
    done: number;
    updatesToday: number;
    pending: number;
  };
  sync: SyncState;
};

export type SearchPayload = { items: ScheduleItem[]; total: number };

export type SubjectDetail = {
  subject: Subject;
  episodes: EpisodeRef[];
  follow: Follow | null;
  weekday: number | null;
};

export type Settings = {
  proxyUrl: string;
  bgmUsername: string;
  timezone: 'Asia/Tokyo' | 'Asia/Shanghai';
  showHistoric: boolean;
  libraryAiringOnly: boolean;
};

export type ProbeResult = {
  proxy: { ok: boolean; ms: number | null; error?: string };
  direct: { ok: boolean; ms: number | null; error?: string };
  proxyUrl: string;
  ms: number;
};
