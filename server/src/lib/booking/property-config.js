/**
 * Per-club booking configuration — the engine's `rBookConfig`.
 *
 * Agilysys serves this from `/wbe-golf-service/golf/.../propertyInfo`, and the
 * whole front end is driven by it: which guest fields are mandatory, how far
 * ahead the calendar opens, whether a card is taken, and the policy prose the
 * guest has to accept. Holding the same shape here means the Postgres-backed
 * club and the Agilysys-backed one configure the front end identically.
 *
 * Cabot Highlands' values are the ones its live engine returns, so the Cabot
 * entry is a faithful target to build against rather than a guess.
 */
import { DEFAULT_CANCELLATION_TIERS } from './engine-domain.js';

const CABOT_CANCELLATION =
  'Cancellations received more than 8 weeks prior to the date of play will be refunded in ' +
  'full. Between 4-8 weeks there will be a 50% cancellation charge. Those received less ' +
  'than 4 weeks before the date of play are non-refundable and non-transferable.';

const CABOT_DEPOSIT =
  'Deposit amounts are in full and include VAT. Full payment is required by return to ' +
  'secure the booking and can be made by either debit or credit card. Please note that ' +
  'caddie fees are not included in the deposit.';

const DORNOCH_CANCELLATION =
  'Cancellations received more than 8 weeks prior to the date of play will be refunded in ' +
  'full. Between 4-8 weeks there will be a 50% cancellation charge. Those received less ' +
  'than 4 weeks before the date of play are non-refundable and non-transferable.';

const DORNOCH_DEPOSIT =
  'A deposit is required to secure the booking and includes VAT. The balance is payable at ' +
  'the club on the day of play. Caddie fees are not included in the deposit.';

/**
 * Cabot Highlands, exactly as its engine reports it. `provider: 'agilysys'`
 * means availability, pricing and the cart come from the WBE rather than this
 * database — the tenant and property below are the ones in its own URLs.
 */
const CABOT_HIGHLANDS = {
  club: 'cabot_highlands',
  provider: 'agilysys',
  propertyName: 'Cabot Highlands',
  confirmationPrefix: 'CH',

  agilysys: {
    baseUrl: 'https://book.onagilysys.eu',
    tenantId: '10282',
    propertyId: 'CabotHighlands',
    appName: 'golf',
  },

  locale: 'EN',
  currency: 'GBP',
  currencySymbol: '£',
  timeZone: 'Europe/London',

  // Straight from `rBookConfig`.
  firstNameRequired: true,
  lastNameRequired: true,
  emailRequired: true,
  phoneRequired: true,
  pincodeRequired: true,
  genderRequired: false,
  titleRequired: false,
  birthdayRequired: false,
  addressRequired: false,
  cityRequired: false,
  stateRequired: false,
  countryRequired: false,
  noOfHolesRequired: false,

  creditCardRequired: true,
  requireTeeTimesDeposit: true,
  allowTeeTimesEdit: false,
  allowTeeTimesCancel: false,
  bookingDaysOut: 591,
  cancelDaysOut: 0,

  cancellationPolicy: CABOT_CANCELLATION,
  depositPolicy: CABOT_DEPOSIT,
  cancellationTiers: DEFAULT_CANCELLATION_TIERS,

  /** `golftimeinterval`: the chips above the tee sheet, and its granularity. */
  intervalMinutes: 2,
  timeRanges: { 'All Day': '8:00 AM - 4:00 PM' },

  maxPlayersPerBooking: 4,
};

/**
 * Royal Dornoch — the proof of concept. Served from this database, so the tee
 * sheet is whatever `golf_tee_sheet` holds, but configured through the same
 * fields Cabot's engine reports.
 */
const ROYAL_DORNOCH = {
  club: 'royal_dornoch',
  provider: 'postgres',
  propertyName: 'Royal Dornoch Golf Club',
  confirmationPrefix: 'RD',

  locale: 'EN',
  currency: 'GBP',
  currencySymbol: '£',
  timeZone: 'Europe/London',

  firstNameRequired: true,
  lastNameRequired: true,
  emailRequired: true,
  phoneRequired: true,
  pincodeRequired: false,
  genderRequired: false,
  titleRequired: false,
  birthdayRequired: false,
  addressRequired: false,
  cityRequired: false,
  stateRequired: false,
  countryRequired: true,
  noOfHolesRequired: false,

  creditCardRequired: true,
  requireTeeTimesDeposit: true,
  allowTeeTimesEdit: false,
  allowTeeTimesCancel: true,
  bookingDaysOut: 365,
  cancelDaysOut: 28,

  cancellationPolicy: DORNOCH_CANCELLATION,
  depositPolicy: DORNOCH_DEPOSIT,
  cancellationTiers: DEFAULT_CANCELLATION_TIERS,

  intervalMinutes: 10,
  timeRanges: {
    'All Day': '6:30 AM - 6:00 PM',
    Morning: '6:30 AM - 11:59 AM',
    Afternoon: '12:00 PM - 6:00 PM',
  },

  maxPlayersPerBooking: 4,
};

const PROFILES = {
  royal_dornoch: ROYAL_DORNOCH,
  cabot_highlands: CABOT_HIGHLANDS,
};

/** Spellings the rest of the codebase already uses for the same club. */
const ALIASES = {
  dornoch: 'royal_dornoch',
  royaldornoch: 'royal_dornoch',
  cabot: 'cabot_highlands',
  cabothighlands: 'cabot_highlands',
};

/**
 * The config for a club, falling back to the proof-of-concept profile.
 *
 * An unknown club gets Dornoch's rules rather than an error: a booking page
 * that opens with the wrong policy prose is a visible, fixable mistake, where
 * one that refuses to render tells nobody anything.
 */
export function bookingConfig(club) {
  const key = String(club ?? '').trim().toLowerCase().replace(/[\s-]/g, '_');
  return PROFILES[key] ?? PROFILES[ALIASES[key.replace(/_/g, '')]] ?? ROYAL_DORNOCH;
}

export function knownBookingClubs() {
  return Object.keys(PROFILES);
}

/** The subset the browser needs. Provider credentials stay on the server. */
export function publicConfig(config) {
  const { agilysys, provider, ...rest } = config;
  return { ...rest, providerKind: provider };
}
