import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { DATE_PRESETS, resolvePreset } from '../lib/dateRanges.js';
import { formatCurrency, formatNumber } from '../lib/format.js';
import { STATUS_COLORS } from '../lib/status.js';
import KpiTile from '../components/KpiTile.jsx';
import {
  CategoryBarChart,
  ChartCard,
  DailyVolumeChart,
  FunnelChart,
  StatusBreakdownChart,
} from '../components/charts.jsx';

const REFRESH_MS = 60_000;

export default function Analytics() {
  const [preset, setPreset] = useState('next90');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTable, setShowTable] = useState(false);

  const range = useMemo(() => resolvePreset(preset, custom), [preset, custom]);

  useEffect(() => {
    let cancelled = false;

    async function load({ silent } = {}) {
      if (!silent) setLoading(true);
      try {
        const payload = await api.analytics(range);
        if (!cancelled) {
          setData(payload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load({ silent: true });
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [range.from, range.to]);

  if (loading && !data) return <div className="empty">Loading analytics…</div>;

  return (
    <div className="stack">
      <div className="between">
        <div>
          <h1>Reports &amp; Analytics</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            {range.from ?? 'earliest'} → {range.to ?? 'latest'}
          </p>
        </div>
        <div className="row">
          <select value={preset} onChange={(event) => setPreset(event.target.value)} aria-label="Analysis period" style={{ width: 'auto' }}>
            {DATE_PRESETS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
          {preset === 'custom' && (
            <>
              <input
                type="date"
                value={custom.from}
                onChange={(event) => setCustom({ ...custom, from: event.target.value })}
                aria-label="From date"
                style={{ width: 'auto' }}
              />
              <input
                type="date"
                value={custom.to}
                onChange={(event) => setCustom({ ...custom, to: event.target.value })}
                aria-label="To date"
                style={{ width: 'auto' }}
              />
            </>
          )}
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}
      {!data && <div className="empty">No analytics available.</div>}

      {data && (
        <>
          <div className="kpi-row">
            <KpiTile label="Total bookings" value={formatNumber(data.totals.bookings)} accent="var(--brand-gold)" />
            <KpiTile
              label="Committed revenue"
              value={formatCurrency(data.totals.revenue)}
              sub="Confirmed + booked only"
              accent={STATUS_COLORS.Booked}
            />
            <KpiTile
              label="Average booking value"
              value={formatCurrency(data.totals.averageValue)}
              accent={STATUS_COLORS.Confirmed}
            />
            <KpiTile label="Total players" value={formatNumber(data.totals.players)} accent={STATUS_COLORS.Requested} />
          </div>

          <ChartCard
            title="Daily booking volume"
            subtitle="Bookings by tee date — hover for the day's value"
          >
            <DailyVolumeChart data={data.daily} />
          </ChartCard>

          <div className="chart-grid">
            <ChartCard
              title="Bookings by status"
              subtitle="Colour brightens along the pipeline; each bar is labelled"
              footer={
                <>
                  <button type="button" className="btn-sm" onClick={() => setShowTable((value) => !value)}>
                    {showTable ? 'Hide table view' : 'Show table view'}
                  </button>
                  {showTable && <StatusTable rows={data.byStatus} />}
                </>
              }
            >
              <StatusBreakdownChart data={data.byStatus} />
            </ChartCard>

            <ChartCard
              title="Conversion funnel"
              subtitle="Bookings that reached each stage, excluding rejected and cancelled"
            >
              <FunnelChart data={data.funnel} />
            </ChartCard>

            <ChartCard title="Most popular tee times" subtitle="Top requested slots">
              <CategoryBarChart data={data.popularTeeTimes} emptyMessage="No tee times recorded." />
            </ChartCard>

            <ChartCard title="Busiest days of the week" subtitle="Bookings by tee date weekday">
              <CategoryBarChart data={data.busiestDays} emptyMessage="No dated bookings." />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

/** The chart's table view — required so no reading depends on colour. */
function StatusTable({ rows }) {
  return (
    <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
      <table className="data" style={{ minWidth: 0 }}>
        <thead>
          <tr>
            <th>Status</th>
            <th className="num">Bookings</th>
            <th className="num">Players</th>
            <th className="num">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.status}>
              <td>{row.status}</td>
              <td className="num">{formatNumber(row.count)}</td>
              <td className="num">{formatNumber(row.players)}</td>
              <td className="num">{formatCurrency(row.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
