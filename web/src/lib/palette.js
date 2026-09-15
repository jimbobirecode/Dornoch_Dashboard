/**
 * The chart palette — one source of truth, read by both `tailwind.config.js`
 * and the chart components. The non-chart UI keeps using the CSS custom
 * properties at the top of `theme.css`; these are the same colours as literals,
 * because Recharts needs a real value for `fill`, not a `var()`.
 *
 * Every ramp here was checked with the data-viz validator against the club's
 * own chart surface (#1D3B2A), not against a generic dark grey. Re-run it
 * before changing any value:
 *
 *   node scripts/validate_palette.js "<hex,...>" --mode dark --surface "#1D3B2A"
 *
 * See DASHBOARD_README.md § Chart colours for what each ramp passed on.
 */

/** The card the charts are drawn on, and the ink that sits on it. */
export const SURFACE = '#1D3B2A';
export const SURFACE_SUNK = '#12261B';
export const GRID = '#335B41';
export const INK_PRIMARY = '#F6F4EE';
export const INK_SECONDARY = '#CFC9AE';
export const INK_MUTED = '#9BA894';

/**
 * Single-series magnitude. One hue, no legend — the title names the series.
 */
export const SERIES = '#C9A227';
export const SERIES_BRIGHT = '#F0E0A6';

/**
 * The pipeline, as an ordinal ramp that brightens toward completion.
 * Passes monotone lightness, step gaps and a 3.79:1 light end on the surface.
 */
export const PIPELINE_RAMP = ['#B8862B', '#C9A227', '#DEC163', '#F0E0A6'];

/**
 * Terminal states. Reserved colours outside the brand palette so a status can
 * never be mistaken for a series; both are always written out in text too.
 */
export const STATUS_COLORS = {
  Inquiry: PIPELINE_RAMP[0],
  Requested: PIPELINE_RAMP[1],
  Confirmed: PIPELINE_RAMP[2],
  Booked: PIPELINE_RAMP[3],
  Rejected: '#DB4F7D',
  Cancelled: '#93A9B8',
};

/**
 * Categorical identity — courses, where the series *are* the subject.
 *
 * Capped at three on purpose: these three clear the all-pairs colourblind and
 * normal-vision floors on this surface (worst CVD ΔE 9.4, worst normal ΔE 20.9).
 * A fourth hue does not, so a fourth category folds into "Other" or the chart
 * becomes a table. Never extend this array without re-running the validator.
 */
export const CATEGORICAL = ['#3987e5', '#d95926', '#199e70'];
export const CATEGORICAL_CAP = CATEGORICAL.length;

/**
 * Continuous magnitude for the tee-sheet heatmap: one hue (21° spread),
 * monotone lightness. The darkest step is allowed to recede toward the surface
 * because it means "almost nothing"; an actual zero is drawn as bare surface
 * with a hairline ring, so empty and nearly-empty never look alike.
 */
export const SEQUENTIAL = ['#4a4c28', '#6b6527', '#8e7d27', '#b39228', '#dec163'];

/**
 * Period-over-period cues. Red and green are indistinguishable to a deuteranope
 * (ΔE 2.4), so these only ever appear in a stat tile beside an arrow glyph and
 * the signed number — never as a mark inside a plot, and never alone.
 */
export const DELTA_UP = '#2FB24A';
export const DELTA_DOWN = '#E8636B';

/** Recessive chrome shared by every chart. */
export const AXIS = {
  stroke: GRID,
  tick: { fill: INK_MUTED, fontSize: 11 },
  tickLine: false,
};

export function categoricalColor(index) {
  return CATEGORICAL[index % CATEGORICAL.length];
}

/** Bucket a 0..1 intensity onto the sequential ramp; 0 stays bare surface. */
export function sequentialStep(intensity) {
  if (!intensity) return null;
  const index = Math.min(
    SEQUENTIAL.length - 1,
    Math.floor(intensity * SEQUENTIAL.length - 1e-9),
  );
  return SEQUENTIAL[Math.max(index, 0)];
}
