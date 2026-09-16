import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { DATE_PRESETS, resolvePreset } from '../lib/dateRanges.js';
import { formatCurrency, formatDate, formatDateShort, formatNumber } from '../lib/format.js';
import { STATUS_COLORS } from '../lib/status.js';
import { INK_MUTED, PIPELINE_RAMP, SERIES, categoricalColor } from '../lib/palette.js';
import KpiTile from '../components/KpiTile.jsx';
import {
  AreaChart,
  BarChart,
  BarList,
  CategoryBar,
  ChartCard,
  Heatmap,
  TableView,
} from '../components/charts/index.js';

const REFRESH_MS = 60_000;

const MEASURES = {
  count: { label: 'Bookings', format: formatNumber, color: SERIES },
  revenue: { label: 'Revenue', format: formatCurrency, color: SERIES },
  players: { label: 'Players', format: formatNumber, color: SERIES },
};

const GRANULARITIES = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

export default function Analytics() {
  const [preset, setPreset] = useState('next90');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [granularity, setGranularity] = useState(null); // null = let the span decide
  const [measure, setMeasure] = useState('count');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => resolvePreset(preset, custom), [preset, custom]);

  useEffect(() => {
    let cancelled = false;

    async function load({ silent } = {}) {
      if (!silent) setLoading(true);
      try {
        const payload = await api.analytics({ ...range, granularity });
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
  }, [range.from, range.to, granularity]);

  if (loading && !data) return <div className="empty">Loading analytics…</div>;

  const active = MEASURES[measure];
  // The server decides the default granularity from the span; once the reader
  // picks one, theirs wins.
  const shownGranularity = granularity ?? data?.granularity ?? 'day';

  return (
    <div className="stack">
      <header className="between">
        <div>
          <h1>Reports &amp; Analytics</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            {range.from ? formatDate(range.from) : 'earliest'} →{' '}
            {range.to ? formatDate(range.to) : 'latest'}
            {data?.comparison && (
              <>
                {' '}· compared with {formatDate(data.comparison.from)} –{' '}
                {formatDate(data.comparison.to)}
              </>
            )}
          </p>
        </div>

        <div className="row">
          <select
            value={preset}
            onChange={(event) => setPreset(event.target.value)}
            aria-label="Analysis period"
            style={{ width: 'auto' }}
          >
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
      </header>

      {error && <div className="banner error">{error}</div>}
      {!data && <div className="empty">No analytics available.</div>}

      {data && (
        <>
          <KpiRow totals={data.totals} />

          <ChartCard
            title={`${active.label} over time`}
            subtitle={`By tee date, ${shownGranularity === 'day' ? 'day by day' : `per ${shownGranularity}`} — hover for the period's detail`}
            action={
              <div className="row" style={{ gap: '0.5rem' }}>
                <Segmented
                  label="Measure"
                  options={Object.entries(MEASURES).map(([id, m]) => ({ id, label: m.label }))}
                  value={measure}
                  onChange={setMeasure}
                />
                <Segmented
                  label="Granularity"
                  options={GRANULARITIES}
                  value={shownGranularity}
                  onChange={setGranularity}
                />
              </div>
            }
            footer={
              <TableView
                label="the numbers"
                columns={[
                  { key: 'date', header: 'Period', render: (row) => formatDate(row.date) },
                  { key: 'count', header: 'Bookings', numeric: true, render: (r) => formatNumber(r.count) },
                  { key: 'players', header: 'Players', numeric: true, render: (r) => formatNumber(r.players) },
                  { key: 'revenue', header: 'Revenue', numeric: true, render: (r) => formatCurrency(r.revenue) },
                ]}
                rows={data.series.map((row) => ({ ...row, key: row.date }))}
              />
            }
          >
            <AreaChart
              data={data.series}
              category={measure}
              color={active.color}
              valueFormatter={active.format}
              labelFormatter={shownGranularity === 'month' ? formatDate : formatDateShort}
              tooltipRows={(row) => [
                { label: 'Bookings', value: formatNumber(row.count), color: SERIES },
                { label: 'Players', value: formatNumber(row.players) },
                { label: 'Committed revenue', value: formatCurrency(row.revenue) },
              ]}
              emptyMessage="No bookings with a tee date in this period."
            />
          </ChartCard>

          <div className="chart-grid">
            <ChartCard
              title="Conversion funnel"
              subtitle="Bookings reaching each stage, excluding rejected and cancelled"
              footer={
                <TableView
                  label="stage detail"
                  columns={[
                    { key: 'stage', header: 'Stage' },
                    { key: 'count', header: 'Reached', numeric: true },
                    { key: 'conversionFromPrevious', header: 'From previous', numeric: true, render: (r) => `${r.conversionFromPrevious}%` },
                    { key: 'droppedHere', header: 'Lost here', numeric: true },
                  ]}
                  rows={data.funnel.map((row) => ({ ...row, key: row.stage }))}
                />
              }
            >
              <BarChart
                data={data.funnel}
                index="stage"
                layout="vertical"
                colorFor={(row) => STATUS_COLORS[row.stage]}
                valueFormatter={formatNumber}
                labelKey="conversionFromTop"
                labelRenderer={(value) => `${value}%`}
                tooltipRows={(row) => [
                  { label: 'Reached', value: formatNumber(row.count), color: STATUS_COLORS[row.stage] },
                  { label: 'Of all enquiries', value: `${row.conversionFromTop}%` },
                  { label: 'From previous stage', value: `${row.conversionFromPrevious}%` },
                  { label: 'Lost at this stage', value: formatNumber(row.droppedHere) },
                ]}
                emptyMessage="No pipeline activity in this period."
              />
            </ChartCard>

            <ChartCard
              title="Booking lead time"
              subtitle={
                data.leadTime.median === null
                  ? 'How far ahead the tee sheet fills'
                  : `Median ${data.leadTime.median} days ahead of play`
              }
              footer={
                <TableView
                  label="the numbers"
                  columns={[
                    { key: 'key', header: 'Booked ahead' },
                    { key: 'count', header: 'Bookings', numeric: true },
                  ]}
                  rows={data.leadTime.distribution}
                />
              }
            >
              <BarChart
                data={data.leadTime.distribution}
                layout="vertical"
                valueFormatter={formatNumber}
                emptyMessage="No bookings carry both an enquiry date and a tee date."
              />
            </ChartCard>

            <ChartCard
              title="Party size"
              subtitle="Players per booking — where the volume and the money actually sit"
              footer={
                <TableView
                  label="the numbers"
                  columns={[
                    { key: 'key', header: 'Party' },
                    { key: 'count', header: 'Bookings', numeric: true },
                    { key: 'players', header: 'Players', numeric: true },
                    { key: 'revenue', header: 'Revenue', numeric: true, render: (r) => formatCurrency(r.revenue) },
                  ]}
                  rows={data.partySizes}
                />
              }
            >
              <BarChart
                data={data.partySizes}
                valueFormatter={formatNumber}
                tooltipRows={(row) => [
                  { label: 'Bookings', value: formatNumber(row.count), color: SERIES },
                  { label: 'Players', value: formatNumber(row.players) },
                  { label: 'Committed revenue', value: formatCurrency(row.revenue) },
                ]}
                emptyMessage="No bookings in this period."
              />
            </ChartCard>

            <ChartCard
              title="Course mix"
              subtitle="A booking naming both courses counts toward each, so these do not sum to the total"
              footer={
                <TableView
                  label="the numbers"
                  columns={[
                    { key: 'key', header: 'Course' },
                    { key: 'count', header: 'Bookings', numeric: true },
                    { key: 'players', header: 'Players', numeric: true },
                    { key: 'revenue', header: 'Revenue', numeric: true, render: (r) => formatCurrency(r.revenue) },
                  ]}
                  rows={data.courses}
                />
              }
            >
              <BarList
                data={data.courses}
                colorFor={(row, index) =>
                  row.key === 'Not specified' ? INK_MUTED : categoricalColor(index)
                }
                valueFormatter={formatNumber}
                emptyMessage="No course recorded on any booking in this period."
              />
            </ChartCard>

            <ChartCard
              title="Bookings by status"
              subtitle="Colour brightens along the pipeline; every bar is labelled"
              footer={
                <TableView
                  label="the numbers"
                  columns={[
                    { key: 'status', header: 'Status' },
                    { key: 'count', header: 'Bookings', numeric: true },
                    { key: 'players', header: 'Players', numeric: true },
                    { key: 'revenue', header: 'Value', numeric: true, render: (r) => formatCurrency(r.revenue) },
                  ]}
                  rows={data.byStatus.map((row) => ({ ...row, key: row.status }))}
                />
              }
            >
              <BarChart
                data={data.byStatus.filter((row) => row.count > 0)}
                index="status"
                layout="vertical"
                colorFor={(row) => STATUS_COLORS[row.status]}
                valueFormatter={formatNumber}
                tooltipRows={(row) => [
                  { label: 'Bookings', value: formatNumber(row.count), color: STATUS_COLORS[row.status] },
                  { label: 'Players', value: formatNumber(row.players) },
                  { label: 'Value', value: formatCurrency(row.revenue) },
                ]}
                emptyMessage="No bookings in this period."
              />
            </ChartCard>

            <ChartCard
              title="Accommodation"
              subtitle={`${data.accommodation.attachRate}% of parties also want a bed`}
            >
              <div className="stack" style={{ gap: '1rem' }}>
                <CategoryBar
                  value={data.accommodation.withAccommodation}
                  total={data.accommodation.total}
                  label="Want accommodation"
                  remainderLabel="Golf only"
                />
                <div className="detail-grid">
                  <Figure
                    label="Average with a stay"
                    value={formatCurrency(data.accommodation.averageWith)}
                  />
                  <Figure
                    label="Average golf only"
                    value={formatCurrency(data.accommodation.averageWithout)}
                  />
                </div>
              </div>
            </ChartCard>
          </div>

          <RequestUtilisation grid={data.requestUtilisation} />

          <div className="chart-grid">
            <ChartCard title="Most requested tee times" subtitle="Top slots by volume">
              <BarChart
                data={data.popularTeeTimes}
                valueFormatter={formatNumber}
                emptyMessage="No tee times recorded."
              />
            </ChartCard>

            <ChartCard title="Busiest days of the week" subtitle="Bookings by tee-date weekday">
              <BarChart
                data={data.busiestDays}
                valueFormatter={formatNumber}
                labelFormatter={(day) => String(day).slice(0, 3)}
                emptyMessage="No dated bookings."
              />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

const REQUEST_MEASURES = [
  { id: 'requests', label: 'Requested' },
  { id: 'bookings', label: 'Booked' },
  { id: 'missed', label: 'Not booked' },
  { id: 'conversion', label: 'Conversion' },
];

/**
 * Enquiries against actual bookings, slot by slot.
 *
 * A grid of confirmed bookings alone cannot tell a quiet slot nobody wants
 * from a busy slot everybody walks away from. This one counts demand where it
 * was asked for and supply where it was played, so the office can read both —
 * and the two lists underneath name the slots worth acting on.
 */
function RequestUtilisation({ grid }) {
  const [metric, setMetric] = useState('requests');
  const { totals } = grid;

  const asPercent = metric === 'conversion';
  const formatValue = asPercent ? (value) => `${value}%` : formatNumber;

  return (
    <>
      <ChartCard
        title="Booking request utilisation"
        subtitle={
          grid.placed
            ? `${formatNumber(totals.requests)} enquiries asked for a slot · ` +
              `${formatNumber(totals.converted)} booked (${totals.conversion}%) · ` +
              `${formatNumber(totals.missed)} did not` +
              (totals.unplaced
                ? ` · ${formatNumber(totals.unplaced)} carry no usable date or time`
                : '')
            : 'No enquiry in this period carries a date and a time to place'
        }
        action={
          <Segmented
            label="Request measure"
            options={REQUEST_MEASURES}
            value={metric}
            onChange={setMetric}
          />
        }
        footer={
          <TableView
            label="the numbers"
            columns={[
              { key: 'day', header: 'Day' },
              { key: 'band', header: 'Time' },
              { key: 'requests', header: 'Asked for', numeric: true },
              { key: 'converted', header: 'Booked it', numeric: true },
              { key: 'declined', header: 'Lost', numeric: true },
              { key: 'open', header: 'Still open', numeric: true },
              { key: 'conversion', header: 'Conversion', numeric: true, render: (r) => `${r.conversion}%` },
              { key: 'bookings', header: 'On the sheet', numeric: true },
              { key: 'revenue', header: 'Value', numeric: true, render: (r) => formatCurrency(r.revenue) },
            ]}
            rows={grid.cells
              .filter((cell) => cell.requests > 0 || cell.bookings > 0)
              .map((cell) => ({ ...cell, key: `${cell.band}|${cell.day}` }))}
          />
        }
      >
        <Heatmap
          cells={grid.cells}
          days={grid.days}
          bands={grid.bands}
          valueKey={metric}
          valueLabel={asPercent ? 'per cent converted' : REQUEST_MEASURES.find((m) => m.id === metric).label.toLowerCase()}
          valueFormatter={formatValue}
          tooltipRows={(cell) => [
            { label: 'Asked for', value: formatNumber(cell.requests ?? 0) },
            { label: 'Booked it', value: formatNumber(cell.converted ?? 0), color: STATUS_COLORS.Booked },
            { label: 'Lost', value: formatNumber(cell.declined ?? 0), color: STATUS_COLORS.Cancelled },
            { label: 'Still open', value: formatNumber(cell.open ?? 0), color: STATUS_COLORS.Inquiry },
            { label: 'Conversion', value: `${cell.conversion ?? 0}%` },
            { label: 'On the sheet', value: formatNumber(cell.bookings ?? 0) },
          ]}
          emptyMessage={
            metric === 'conversion'
              ? 'No slot in this period has an enquiry to convert.'
              : 'No enquiry in this period has a date and a time to place.'
          }
        />
      </ChartCard>

      <div className="chart-grid">
        <ChartCard
          title="Asked for, not booked"
          subtitle="The slots demand keeps landing on and walking away from"
          footer={
            <TableView
              label="the numbers"
              columns={[
                { key: 'key', header: 'Slot' },
                { key: 'requests', header: 'Asked for', numeric: true },
                { key: 'converted', header: 'Booked it', numeric: true },
                { key: 'declined', header: 'Lost', numeric: true },
                { key: 'open', header: 'Still open', numeric: true },
                { key: 'conversion', header: 'Conversion', numeric: true, render: (r) => `${r.conversion}%` },
              ]}
              rows={grid.gaps}
            />
          }
        >
          <BarList
            data={grid.gaps}
            category="missed"
            colorFor={(row) => (row.conversion ? STATUS_COLORS.Requested : STATUS_COLORS.Cancelled)}
            valueFormatter={formatNumber}
            emptyMessage="Every slot that was asked for was booked."
          />
        </ChartCard>

        <ChartCard
          title="Moved to another slot"
          subtitle={
            totals.moved
              ? `${formatNumber(totals.moved)} parties play a band other than the one they asked for`
              : 'Every booking plays the band it asked for'
          }
        >
          <BarList
            data={grid.shifts.map((shift) => ({
              ...shift,
              label: `${shift.day}: ${shift.from} → ${shift.to}`,
            }))}
            category="count"
            colorFor={() => STATUS_COLORS.Confirmed}
            valueFormatter={formatNumber}
            emptyMessage="No booking was moved off the band it asked for."
          />
        </ChartCard>
      </div>
    </>
  );
}

function KpiRow({ totals }) {
  const delta = totals.delta ?? {};

  return (
    <div className="kpi-row">
      <KpiTile
        label="Total bookings"
        value={formatNumber(totals.bookings)}
        delta={delta.bookings}
        accent={PIPELINE_RAMP[1]}
      />
      <KpiTile
        label="Committed revenue"
        value={formatCurrency(totals.revenue)}
        sub="Confirmed and booked only"
        delta={delta.revenue}
        accent={STATUS_COLORS.Booked}
      />
      <KpiTile
        label="Average booking value"
        value={formatCurrency(totals.averageValue)}
        delta={delta.averageValue}
        accent={STATUS_COLORS.Confirmed}
      />
      <KpiTile
        label="Conversion"
        value={`${totals.conversionRate}%`}
        sub={`${formatNumber(totals.committed)} of ${formatNumber(totals.bookings)} committed`}
        accent={STATUS_COLORS.Requested}
      />
      <KpiTile
        label="Lost"
        value={`${totals.cancellationRate}%`}
        sub={`${formatNumber(totals.lost)} rejected or cancelled`}
        accent={STATUS_COLORS.Rejected}
      />
    </div>
  );
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Figure({ label, value }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}
