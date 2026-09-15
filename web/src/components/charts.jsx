import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { STATUS_COLORS } from '../lib/status.js';
import { formatCurrency, formatDateShort, formatNumber } from '../lib/format.js';

const GRID = '#335B41';
const AXIS_TEXT = '#9BA894';
const GOLD = '#C9A227';
const GOLD_BRIGHT = '#F0E0A6';

const axisProps = {
  stroke: GRID,
  tick: { fill: AXIS_TEXT, fontSize: 11 },
  tickLine: false,
};

/** Values and labels wear text tokens; the mark beside them carries identity. */
function TooltipBox({ title, rows }) {
  return (
    <div className="chart-tooltip">
      <div style={{ fontWeight: 700, marginBottom: rows.length ? '0.3rem' : 0 }}>{title}</div>
      {rows.map((row) => (
        <div key={row.label} className="row" style={{ gap: '0.5rem', justifyContent: 'space-between' }}>
          <span className="secondary">{row.label}</span>
          <span style={{ fontWeight: 600 }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartCard({ title, subtitle, children, footer }) {
  return (
    <section className="card stack" style={{ gap: '0.75rem' }}>
      <div>
        <h3>{title}</h3>
        {subtitle && (
          <p className="muted" style={{ margin: '0.15rem 0 0', fontSize: '0.8125rem' }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
      {footer}
    </section>
  );
}

/** Change over time — area with a crosshair-style shared tooltip. */
export function DailyVolumeChart({ data }) {
  if (!data.length) return <div className="empty">No bookings in this period.</div>;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatDateShort} minTickGap={28} {...axisProps} />
        <YAxis allowDecimals={false} width={34} {...axisProps} />
        <Tooltip
          cursor={{ stroke: GOLD_BRIGHT, strokeWidth: 1 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                title={formatDateShort(label)}
                rows={[
                  { label: 'Bookings', value: formatNumber(payload[0].value) },
                  { label: 'Value', value: formatCurrency(payload[0].payload.revenue) },
                ]}
              />
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke={GOLD_BRIGHT}
          strokeWidth={2}
          fill="url(#volumeFill)"
          activeDot={{ r: 4, stroke: '#1D3B2A', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Magnitude by category — horizontal bars, direct-labelled so the category
 * never depends on colour. One hue per status from the ordinal ramp.
 */
export function StatusBreakdownChart({ data }) {
  const rows = data.filter((entry) => entry.count > 0);
  if (!rows.length) return <div className="empty">No bookings in this period.</div>;

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 42)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...axisProps} />
        <YAxis type="category" dataKey="status" width={86} {...axisProps} />
        <Tooltip
          cursor={{ fill: 'rgba(201, 162, 39, 0.12)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={payload[0].payload.status}
                rows={[
                  { label: 'Bookings', value: formatNumber(payload[0].payload.count) },
                  { label: 'Value', value: formatCurrency(payload[0].payload.revenue) },
                  { label: 'Players', value: formatNumber(payload[0].payload.players) },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell key={row.status} fill={STATUS_COLORS[row.status]} />
          ))}
          <LabelList dataKey="count" position="right" fill="#CFC9AE" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Ordinal stages — the ramp brightens toward completion. */
export function FunnelChart({ data }) {
  if (!data.some((entry) => entry.count > 0)) {
    return <div className="empty">No pipeline activity in this period.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...axisProps} />
        <YAxis type="category" dataKey="stage" width={86} {...axisProps} />
        <Tooltip
          cursor={{ fill: 'rgba(201, 162, 39, 0.12)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={payload[0].payload.stage}
                rows={[
                  { label: 'Reached', value: formatNumber(payload[0].payload.count) },
                  { label: 'Of all enquiries', value: `${payload[0].payload.conversionFromTop}%` },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.stage} fill={STATUS_COLORS[row.stage]} />
          ))}
          <LabelList
            dataKey="conversionFromTop"
            position="right"
            fill="#CFC9AE"
            fontSize={11}
            formatter={(value) => `${value}%`}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Single-series magnitude — one hue, no legend; the title names the series. */
export function CategoryBarChart({ data, emptyMessage, height = 220 }) {
  if (!data.some((entry) => entry.count > 0)) return <div className="empty">{emptyMessage}</div>;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="key" interval={0} angle={-20} textAnchor="end" height={52} {...axisProps} />
        <YAxis allowDecimals={false} width={34} {...axisProps} />
        <Tooltip
          cursor={{ fill: 'rgba(201, 162, 39, 0.12)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={payload[0].payload.key}
                rows={[{ label: 'Bookings', value: formatNumber(payload[0].value) }]}
              />
            ) : null
          }
        />
        <Bar dataKey="count" fill={GOLD} radius={[4, 4, 0, 0]} barSize={22} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
