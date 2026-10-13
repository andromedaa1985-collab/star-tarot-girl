import PageHeader from '../components/ui/PageHeader';
import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
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
    <div className="rail-page">
      <div className="rail-page-content">
        <PageHeader eyebrow="内测管理" title="内测数据" description="这里只统计匿名事件，不收集聊天内容。重点看每日运势的使用情况，以及今日深解的点击情况。" backTo="/app/profile" action={<button type="button" onClick={loadSummary} disabled={isLoading} className="rail-button-secondary"><RefreshCw size={17} className={isLoading ? 'animate-spin' : ''} />刷新</button>} />
        <div className="rail-panel">
          <label htmlFor="analytics-token" className="text-[15px] font-medium text-apple-text">后台 Token</label>
          <div className="mt-2 flex gap-2">
            <input
              id="analytics-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="本地可留空；线上建议配置 ANALYTICS_ADMIN_TOKEN"
              className="rail-field min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={loadSummary}
              className="rail-button"
            >
              查看
            </button>
          </div>
          {error && <div role="alert" className="mt-3 rounded-2xl bg-[#b94a28]/10 p-3 text-[13px] leading-[1.8] text-[#b94a28]">{error}</div>}
        </div>

        {summary && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard label="匿名用户" value={summary.uniqueUsers} />
              <MetricCard label="事件数" value={summary.totalEvents} />
              <MetricCard label="今日运势" value={summary.funnel.dailyFortuneDraws} />
              <MetricCard label="深解点击" value={summary.funnel.deepPlanClicks} />
            </div>

            <section className="rail-panel mt-6">
              <div className="rail-section-title flex items-center gap-2">
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

            <section className="rail-panel mt-6">
              <div className="rail-section-title flex items-center gap-2">
                <ShieldCheck size={17} className="text-apple-gold" />
                最近 14 天
              </div>
              <div className="mt-4 overflow-x-auto">
                <table aria-label="最近 14 天匿名使用数据" className="w-full min-w-[720px] text-left text-[13px] tabular-nums">
                  <thead className="text-apple-text-muted">
                    <tr>
                      <th className="py-3 font-medium">日期</th>
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
                        <td className="py-3 font-medium">{row.day}</td>
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
    <div className="rail-surface p-5">
      <div className="text-[13px] font-semibold text-apple-text-muted">{label}</div>
      <div className="mt-3 text-3xl font-medium tabular-nums text-apple-text">{value}</div>
    </div>
  );
}

function FunnelRow({ label, value, rate }: { label: string; value: number; rate: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
        <span className="font-semibold text-apple-text">{label}</span>
        <span className="text-apple-text-muted tabular-nums">{value} · {rate}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-apple-surface-hover">
        <div className="h-full rounded-full bg-apple-gold" style={{ width: `${Math.max(3, Math.min(100, rate))}%` }} />
      </div>
    </div>
  );
}
