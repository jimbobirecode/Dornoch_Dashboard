/**
 * The booking pipeline as the SPA sees it.
 *
 * Colours are the gorse-gold ordinal ramp from `theme.css`, repeated here as
 * literals because Recharts needs a real colour for `fill`, not a CSS variable.
 * They must stay in step with the `--status-*` tokens.
 */
export const PIPELINE_STAGES = ['Inquiry', 'Requested', 'Confirmed', 'Booked'];

export const TERMINAL_STATUSES = ['Rejected', 'Cancelled'];

export const ALL_STATUSES = [...PIPELINE_STAGES, ...TERMINAL_STATUSES];

/** Nothing is hidden until the reader asks for it to be. */
export const DEFAULT_STATUS_FILTER = [...ALL_STATUSES];

export const STATUS_COLORS = {
  Inquiry: '#B8862B',
  Requested: '#C9A227',
  Confirmed: '#DEC163',
  Booked: '#F0E0A6',
  Rejected: '#DB4F7D',
  Cancelled: '#93A9B8',
};

const UNKNOWN_COLOR = '#9BA894'; // --text-muted

/** 'Pending' is the Streamlit-era spelling of 'Inquiry' and still in old rows. */
export function normaliseStatus(status) {
  if (!status) return PIPELINE_STAGES[0];
  const text = String(status).trim();
  if (text.toLowerCase() === 'pending') return 'Inquiry';
  return ALL_STATUSES.find((known) => known.toLowerCase() === text.toLowerCase()) ?? text;
}

export function statusColor(status) {
  return STATUS_COLORS[normaliseStatus(status)] ?? UNKNOWN_COLOR;
}

/** The stage a booking moves to next, or null at the end of the pipeline. */
export function nextStage(status) {
  const index = PIPELINE_STAGES.indexOf(normaliseStatus(status));
  if (index === -1) return null; // rejected, cancelled, or something unknown
  return PIPELINE_STAGES[index + 1] ?? null;
}
