/**
 * The club profile, API side — the server's half of what `club_config.py`
 * holds for the Streamlit dashboard and `web/src/lib/brand.js` for the SPA.
 *
 * Only the values the API itself needs live here: how money and dates are
 * spelled in outgoing email, and the names a guest sees on it.
 *
 * Values are taken from the `royal_dornoch` profile in `club_config.py`.
 */
export const BRAND = {
  clubId: 'royal_dornoch',
  name: 'Royal Dornoch',
  fullName: 'Royal Dornoch Golf Club',

  /** The sender name on customer-journey email; FROM_NAME overrides it. */
  fromName: 'Royal Dornoch Golf Club',

  /** Used when a booking carries no course of its own. */
  defaultCourse: 'Championship Course',

  locale: 'en-GB',
  currency: 'GBP',
  timeZone: 'Europe/London',
};
