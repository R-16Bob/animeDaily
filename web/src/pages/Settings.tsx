import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ProbeResult, Settings } from '../lib/types';
import { formatBytes } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { PageTitle, SectionHeader, Spinner } from '../components/ui';

type PageProps = {
  onChanged: () => void;
  notify: (text: string, tone?: 'info' | 'success' | 'error') => void;
  revision: number;
};

export function SettingsPage({ onChanged, notify, revision }: PageProps) {
  const settingsQuery = useAsync(() => api.settings(), [revision]);
  const healthQuery = useAsync(() => api.health(), [revision]);

  const [form, setForm] = useState<Settings>({
    proxyUrl: '',
    bgmUsername: '',
    timezone: 'Asia/Shanghai',
    showHistoric: false,
    libraryAiringOnly: true,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    if (settingsQuery.data?.settings && !dirty) {
      setForm(settingsQuery.data.settings);
    }
  }, [settingsQuery.data, dirty]);

  const update = (patch: Partial<Settings>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const save = async (patch?: Partial<Settings>) => {
    setSaving(true);
    try {
      const body = { ...form, ...(patch ?? {}) };
      const result = await api.saveSettings(body);
      setForm(result.settings);
      setDirty(false);
      notify('设置已保存', 'success');
      onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const runProbe = async () => {
    setProbing(true);
    try {
      const result = await api.probe();
      setProbe(result);
      if (result.proxy.ok) notify(`代理连通 · ${result.proxy.ms} ms`, 'success');
      else notify('代理不可用，请确认 Clash 已启动', 'error');
    } catch (err) {
      notify(err instanceof Error ? err.message : '测试失败', 'error');
    } finally {
      setProbing(false);
    }
  };

  const importBangumi = async () => {
    const username = form.bgmUsername.trim();
    if (!username) {
      notify('请先填写 Bangumi 用户名', 'error');
      return;
    }
    setImporting(true);
    try {
      const result = await api.importBangumi(username);
      notify(`导入完成：新增 ${result.added} 部，已存在 ${result.skipped} 部`, 'success');
      onChanged();
      healthQuery.reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setImporting(false);
    }
  };

  const forceSync = async () => {
    try {
      await api.sync(true);
      notify('已开始刷新追番话数', 'info');
      onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : '刷新失败', 'error');
    }
  };

  const purge = async () => {
    setPurging(true);
    try {
      await api.purge();
      notify('缓存已清空，下次打开会重新拉取', 'success');
      healthQuery.reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : '清理失败', 'error');
    } finally {
      setPurging(false);
    }
  };

  const health = healthQuery.data;

  return (
    <div className="page page--narrow">
      <PageTitle kicker="SETTINGS" title="设置" subtitle="代理、账号、时区与缓存" />

      <section className="block">
        <SectionHeader title="网络与代理" hint="Bangumi 在国区被墙，需要 HTTP 代理" />
        <div className="form-card">
          <label className="field">
            <span className="field__label">代理地址</span>
            <div className="field__row">
              <input
                value={form.proxyUrl}
                onChange={(event) => update({ proxyUrl: event.target.value })}
                placeholder="http://127.0.0.1:7890"
                spellCheck={false}
              />
              <button type="button" className="btn btn--ghost" onClick={runProbe} disabled={probing}>
                {probing ? <Spinner size={13} /> : '测试连通'}
              </button>
            </div>
            <span className="field__hint">留空则直连。Clash 默认 http://127.0.0.1:7890</span>
          </label>

          {probe ? (
            <div className="probe">
              <span className={`chip ${probe.proxy.ok ? 'chip--ok' : 'chip--bad'}`}>
                代理 {probe.proxy.ok ? `可用 ${probe.proxy.ms}ms` : '不可用'}
              </span>
              <span className={`chip ${probe.direct.ok ? 'chip--ok' : 'chip--bad'}`}>
                直连 {probe.direct.ok ? `可用 ${probe.direct.ms}ms` : '不可用'}
              </span>
              {!probe.proxy.ok && probe.proxy.error ? <span className="dim tiny">{probe.proxy.error}</span> : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="block">
        <SectionHeader title="Bangumi 账号" hint="只读导入公开收藏，不需要授权" />
        <div className="form-card">
          <label className="field">
            <span className="field__label">用户名或个人主页地址</span>
            <div className="field__row">
              <input
                value={form.bgmUsername}
                onChange={(event) => update({ bgmUsername: event.target.value })}
                placeholder="例如：sai 或 https://bgm.tv/user/sai"
                spellCheck={false}
              />
              <button type="button" className="btn btn--accent" onClick={importBangumi} disabled={importing}>
                {importing ? <Spinner size={13} /> : '导入追番'}
              </button>
            </div>
            <span className="field__hint">
              会拉取你「在看」和「想看」的收藏，带已看集数；已存在的条目不会覆盖本地进度
            </span>
          </label>
        </div>
      </section>

      <section className="block">
        <SectionHeader title="显示" hint="放送日按哪个时区计算" />
        <div className="form-card">
          <label className="field">
            <span className="field__label">计日时区</span>
            <div className="segmented">
              <button
                type="button"
                className={form.timezone === 'Asia/Shanghai' ? 'is-active' : ''}
                onClick={() => update({ timezone: 'Asia/Shanghai' })}
              >
                中国时间（默认）
              </button>
              <button
                type="button"
                className={form.timezone === 'Asia/Tokyo' ? 'is-active' : ''}
                onClick={() => update({ timezone: 'Asia/Tokyo' })}
              >
                日本放送日
              </button>
            </div>
            <span className="field__hint">
              按北京时间 00:00 换日，符合国内的观看习惯；切到「日本放送日」后深夜档会提前一天归入，
              更适合对照日本原播出时间
            </span>
          </label>

          <label className="field field--row">
            <div>
              <span className="field__label">显示历史番剧</span>
              <span className="field__hint">
                关闭时，「今日更新」只统计当前仍在连载的番；打开后，已完结但放送星期与今天相同的番也会出现
              </span>
            </div>
            <button
              type="button"
              className={`toggle ${form.showHistoric ? 'is-on' : ''}`}
              role="switch"
              aria-checked={form.showHistoric}
              onClick={() => update({ showHistoric: !form.showHistoric })}
            >
              <span className="toggle__knob" />
            </button>
          </label>
        </div>
      </section>

      <section className="block">
        <SectionHeader title="缓存与数据" hint="本地文件，随时可清" />
        <div className="form-card">
          <div className="kv">
            <span>接口缓存</span>
            <strong>{health ? `${health.cache.files} 个文件 · ${formatBytes(health.cache.bytes)}` : '—'}</strong>
          </div>
          <div className="kv">
            <span>封面缓存</span>
            <strong>{health ? `${health.covers.files} 张 · ${formatBytes(health.covers.bytes)}` : '—'}</strong>
          </div>
          <div className="kv">
            <span>追番条目</span>
            <strong>{health ? `${health.follows} 部` : '—'}</strong>
          </div>
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button type="button" className="btn btn--ghost" onClick={forceSync}>
              刷新追番话数
            </button>
            <button type="button" className="btn btn--plain btn--danger" onClick={purge} disabled={purging}>
              {purging ? <Spinner size={13} /> : '清空缓存'}
            </button>
          </div>
        </div>
      </section>

      <section className="block">
        <SectionHeader title="关于" />
        <div className="form-card form-card--flat">
          <p className="about">
            <strong>AnimeDaily</strong> v0.1 · 追番管理
            <br />
            数据来源：Bangumi 公共 API（每日放送 / 条目 / 逐话放送日期 / 公开收藏），无需登录。
            <br />
            所有追番与进度只存在本机 <code>data/store.json</code>，封面缓存在 <code>data/covers</code>。
          </p>
        </div>
      </section>

      {dirty ? (
        <div className="save-bar">
          <span>有未保存的修改</span>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--plain"
              onClick={() => {
                setDirty(false);
                setForm(settingsQuery.data?.settings ?? form);
              }}
            >
              还原
            </button>
            <button type="button" className="btn btn--accent" onClick={() => void save()} disabled={saving}>
              {saving ? <Spinner size={13} /> : '保存设置'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
