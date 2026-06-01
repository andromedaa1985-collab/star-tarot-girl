import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { apiFetch } from '../lib/apiClient';

type AnalyticsSummary = {
  updatedAt: string;
  totalEvents: number;
  uniqueUsers: number;
  countsByEvent: Record<string, number>;
  funnel: {
    dailyFortuneDraws: number;
    deepImpressions: number;
    deepPaywallOpens: number;
    deepPlanClicks: number;
    deepGenerates: number;
    impressionRate: number;
    paywallOpenRate: number;
    planClickRate: number;
    deepGenerateRate: number;
  };
  planClicks: Record<string, number>;
  dailyRows: Array<{
    day: string;
    users: number;
    sessions: number;
    dailyFortuneDraws: number;
    deepImpressions: number;
    deepPaywallOpens: number;
    deepPlanClicks: number;
    deepGenerates: number;
  }>;
};

const TOKEN_KEY = 'astroRailAnalyticsAdminToken';

export default function Analytics() {
  const initialToken = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || localStorage.getItem(TOKEN_KEY) || '';
  }, []);
  const [token, setToken] = useState(initialToken);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (token.trim()) localStorage.setItem(TOKEN_KEY, token.trim());
      const query = token.trim() ? `?token=${encodeURIComponent(token.trim())}` : '';
      const response = await apiFetch(`/api/analytics/summary${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || '读取统计失败');
      setSummary(data);
    } catch (loadError: any) {
      setError(loadError?.message || '读取统计失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, []);

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-5 pb-32 pt-5 text-apple-text no-scrollbar">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black tracking-[0.2em] text-apple-gold">
              <BarChart3 size={16} />
              BETA DATA
            </div>
            <h1 className="mt-2 text-2xl font-black">内测数据</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-apple-text-muted">
              这里只统计匿名事件，不收集聊天内容。重点看每日运势有没有被反复使用，以及今日深解有没有被点击。
            </p>
          </div>
          <button
            type="button"
            onClick={loadSummary}
            disabled={isLoading}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-apple-border bg-apple-surface text-apple-text-muted disabled:opacity-50"
            aria-label="刷新统计"
            title="刷新统计"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="mt-5 rounded-[26px] border border-apple-border bg-apple-surface p-4">
          <label className="text-xs font-bold text-apple-text-muted">后台 Token</label>
          <div className="mt-2 flex gap-2">
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="本地可留空；线上建议配置 ANALYTICS_ADMIN_TOKEN"
              className="min-w-0 flex-1 rounded-2xl border border-apple-border bg-apple-bg px-3 py-2 text-sm text-apple-text outline-none focus:border-apple-gold/50"
            />
            <button
              type="button"
              onClick={loadSummary}
              className="rounded-2xl bg-apple-gold px-4 py-2 text-sm font-black text-[#11131a]"
            >
              查看
            </button>
          </div>
          {error && <div className="mt-3 rounded-2xl bg-[#b94a28]/10 p-3 text-xs leading-relaxed text-[#b94a28]">{error}</div>}
        </div>

        {summary && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard label="匿名用户" value={summary.uniqueUsers} />
              <MetricCard label="事件数" value={summary.totalEvents} />
              <MetricCard label="今日运势" value={summary.funnel.dailyFortuneDraws} />
              <MetricCard label="深解点击" value={summary.funnel.deepPlanClicks} />
            </div>

            <section className="mt-5 rounded-[30px] border border-apple-border bg-apple-surface p-5">
              <div className="flex items-center gap-2 text-sm font-black">
                <Sparkles size={17} className="text-apple-gold" />
                今日深解漏斗
              </div>
              <div className="mt-4 grid gap-3">
                <FunnelRow label="每日运势抽取" value={summary.funnel.dailyFortuneDraws} rate={100} />
                <FunnelRow label="看到深解入口" value={summary.funnel.deepImpressions} rate={summary.funnel.impressionRate} />
                <FunnelRow label="打开付费说明" value={summary.funnel.deepPaywallOpens} rate={summary.funnel.paywallOpenRate} />
                <FunnelRow label="点击价格/月卡" value={summary.funnel.deepPlanClicks} rate={summary.funnel.planClickRate} />
                <FunnelRow label="已生成深解" value={summary.funnel.deepGenerates} rate={summary.funnel.deepGenerateRate} />
              </div>
            </section>

            <section className="mt-5 rounded-[30px] border border-apple-border bg-apple-surface p-5">
              <div className="flex items-center gap-2 text-sm font-black">
                <ShieldCheck size={17} className="text-apple-gold" />
                最近 14 天
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="text-apple-text-muted">
                    <tr>
                      <th className="py-2">日期</th>
                      <th>用户</th>
                      <th>打开</th>
                      <th>日运</th>
                      <th>深解曝光</th>
                      <th>付费说明</th>
                      <th>点击价格</th>
                      <th>生成深解</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.dailyRows.map((row) => (
                      <tr key={row.day} className="border-t border-apple-border">
                        <td className="py-2 font-bold">{row.day}</td>
                        <td>{row.users}</td>
                        <td>{row.sessions}</td>
                        <td>{row.dailyFortuneDraws}</td>
                        <td>{row.deepImpressions}</td>
                        <td>{row.deepPaywallOpens}</td>
                        <td>{row.deepPlanClicks}</td>
                        <td>{row.deepGenerates}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-apple-border bg-apple-surface p-4">
      <div className="text-xs font-bold text-apple-text-muted">{label}</div>
      <div className="mt-2 text-2xl font-black text-apple-text">{value}</div>
    </div>
  );
}

function FunnelRow({ label, value, rate }: { label: string; value: number; rate: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="font-bold text-apple-text">{label}</span>
        <span className="text-apple-text-muted">{value} · {rate}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-apple-surface-hover">
        <div className="h-full rounded-full bg-apple-gold" style={{ width: `${Math.max(3, Math.min(100, rate))}%` }} />
      </div>
    </div>
  );
}
