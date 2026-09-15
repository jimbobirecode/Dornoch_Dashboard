/**
 * Everything club-specific in one place — the JavaScript equivalent of
 * `club_config.py`. The colour tokens live at the top of `theme.css`; this file
 * carries the names, the mark and the wording that changes per customer.
 *
 * Values are taken from the `royal_dornoch` profile in `club_config.py`.
 */
export const BRAND = {
  name: 'Royal Dornoch',
  fullName: 'Royal Dornoch Golf Club',
  tagline: 'Visitor Bookings',

  /** Served from `web/public`. Set to null to fall back to the wordmark. */
  logoUrl: '/logo.png',
  /**
   * The supplied artwork is dark green on transparent, so it needs a light
   * plate on the green sidebar. Set true once a reversed logo is dropped in.
   */
  logoOnDark: false,

  /** 'Accommodation' here; Streamsong calls the same thing 'Lodging'. */
  lodgingLabel: 'Accommodation',

  locale: 'en-GB',
  currency: 'GBP',
  timeZone: 'Europe/London',
};
