/**
 * The booking pipeline as the SPA sees it.
 *
 * The colours live in `palette.js` — the one place the chart ramps are defined
 * and validated — and are re-exported here so status consumers keep importing
 * from a single module.
 */
import { INK_MUTED, STATUS_COLORS } from './palette.js';

export { STATUS_COLORS };
export const PIPELINE_STAGES = ['Inquiry', 'Requested', 'Confirmed', 'Booked'];

export const TERMINAL_STATUSES = ['Rejected', 'Cancelled'];

export const ALL_STATUSES = [...PIPELINE_STAGES, ...TERMINAL_STATUSES];

/** Nothing is hidden until the reader asks for it to be. */
export const DEFAULT_STATUS_FILTER = [...ALL_STATUSES];

const UNKNOWN_COLOR = INK_MUTED;

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
