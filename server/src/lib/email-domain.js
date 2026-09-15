/**
 * Customer-journey email vocabulary, ported from
 * `modules/customer_journey/emails.py`.
 *
 * Two campaigns run off the tee sheet: a pre-arrival welcome a few days before
 * play, and a post-play thank you a couple of days after. Everything here is
 * pure — candidate selection, the SendGrid dynamic-template payload and the
 * configuration check — so the routes stay thin and the rules are testable
 * without a database or an API key.
 */
import { BRAND } from './brand.js';

/** Bookings only enter a campaign once the club has committed to them. */
export const SENDABLE_STATUSES = ['Confirmed', 'Booked'];

/** How far back `showAll` looks for a post-play send. */
const POST_PLAY_LOOKBACK_DAYS = 30;

export const CAMPAIGNS = {
  pre_arrival: {
    id: 'pre_arrival',
    label: 'Pre-arrival welcome',
    /** Which side of the play date the campaign sits on. */
    direction: 'before',
    defaultDays: 3,
    daysEnv: 'PRE_ARRIVAL_DAYS',
    templateEnv: 'SENDGRID_TEMPLATE_PRE_ARRIVAL',
    column: 'pre_arrival_email_sent_at',
    field: 'preArrivalEmailSentAt',
  },
  post_play: {
    id: 'post_play',
    label: 'Post-play thank you',
    direction: 'after',
    defaultDays: 2,
    daysEnv: 'POST_PLAY_DAYS',
    templateEnv: 'SENDGRID_TEMPLATE_POST_PLAY',
    column: 'post_play_email_sent_at',
    field: 'postPlayEmailSentAt',
  },
};

export const CAMPAIGN_IDS = Object.keys(CAMPAIGNS);

export function getCampaign(id) {
  return CAMPAIGNS[id] ?? null;
}

/**
 * The email settings as the environment has them, with the secret reduced to a
 * yes/no — this shape is handed to the browser, so it must never carry the key
 * itself.
 */
export function readEmailConfig(env = process.env) {
  const campaigns = {};
  for (const campaign of Object.values(CAMPAIGNS)) {
    campaigns[campaign.id] = {
      id: campaign.id,
      label: campaign.label,
      direction: campaign.direction,
      days: positiveInt(env[campaign.daysEnv], campaign.defaultDays),
      templateId: env[campaign.templateEnv] ?? null,
      templateEnv: campaign.templateEnv,
      configured: Boolean(env[campaign.templateEnv]),
    };
  }

  const missing = [];
  if (!env.SENDGRID_API_KEY) missing.push('SENDGRID_API_KEY');
  if (!env.FROM_EMAIL) missing.push('FROM_EMAIL');
  for (const campaign of Object.values(campaigns)) {
    if (!campaign.configured) missing.push(campaign.templateEnv);
  }

  return {
    hasApiKey: Boolean(env.SENDGRID_API_KEY),
    apiKey: env.SENDGRID_API_KEY ?? null,
    fromEmail: env.FROM_EMAIL ?? null,
    fromName: env.FROM_NAME ?? BRAND.fromName,
    campaigns,
    missing,
    configured: missing.length === 0,
  };
}

/** Strips the API key, for anything that crosses the wire. */
export function publicEmailConfig(config) {
  const { apiKey, ...rest } = config;
  return rest;
}

/** Whether a campaign has everything it needs to send. */
export function campaignReady(config, campaignId) {
  return config.hasApiKey && Boolean(config.fromEmail) && Boolean(config.campaigns[campaignId]?.configured);
}

/**
 * The calendar day the campaign targets: `days` before the play date for
 * pre-arrival, `days` after for post-play. Both are expressed as the play date
 * a booking must carry to be due today.
 */
export function targetDate(campaign, days, today) {
  const offset = campaign.direction === 'before' ? days : -days;
  return addDays(today, offset);
}

/**
 * The bookings a campaign would send to.
 *
 * `scope: 'due'` is the scheduled behaviour — exactly the play date that falls
 * `days` either side of today. `scope: 'all'` is the manual catch-up the
 * Streamlit page offered: every upcoming booking for pre-arrival, the last 30
 * days of play for post-play. Rows already emailed are kept in the list and
 * flagged, so the page can offer a deliberate resend.
 */
export function selectCandidates(bookings, { campaign, days, today, scope = 'due' } = {}) {
  const inScope =
    scope === 'all'
      ? (date) =>
          campaign.direction === 'before'
            ? date >= today
            : date <= today && date >= addDays(today, -POST_PLAY_LOOKBACK_DAYS)
        : (date) => date === targetDate(campaign, days, today);

  return bookings
    .filter((booking) => booking.date && SENDABLE_STATUSES.includes(booking.status))
    .filter((booking) => inScope(booking.date))
    .map((booking) => ({ ...booking, sentAt: booking[campaign.field] ?? null }))
    .sort((a, b) =>
      campaign.direction === 'before' ? compare(a, b) : compare(b, a),
    );
}

function compare(a, b) {
  return a.date === b.date
    ? String(a.teeTime).localeCompare(String(b.teeTime))
    : a.date.localeCompare(b.date);
}

/**
 * The dynamic-template data the SendGrid templates expect.
 *
 * The field names — and the duplicated legacy spellings below them — match
 * `modules/customer_journey/emails.py` exactly, so the same SendGrid templates
 * keep working against this dashboard.
 */
export function buildTemplateData(booking, { fromEmail, now = new Date() } = {}) {
  const guestName = booking.guestName?.trim() || nameFromEmail(booking.guestEmail);
  const playDate = formatLongDate(booking.date);
  const course = booking.golfCourses?.trim() || BRAND.defaultCourse;
  const players = String(booking.players ?? 0);

  return {
    guest_name: guestName,
    booking_date: playDate,
    course_name: course,
    tee_time: booking.teeTime || 'TBD',
    player_count: players,
    booking_reference: booking.bookingId,
    current_year: String(now.getFullYear()),

    // Older templates were written against these names; both are sent so a
    // template from either era renders.
    date: playDate,
    course,
    players,
    booking_ref: booking.bookingId,
    play_date: playDate,

    total: formatMoney(booking.total),
    club_email: fromEmail ?? '',
    club_name: BRAND.fullName,

    hotel_required: booking.hotelRequired ? 'Yes' : 'No',
    hotel_checkin: booking.hotelCheckin ? formatLongDate(booking.hotelCheckin) : '',
    hotel_checkout: booking.hotelCheckout ? formatLongDate(booking.hotelCheckout) : '',
    lodging_nights: String(booking.lodgingNights ?? 0),
    lodging_rooms: String(booking.lodgingRooms ?? 0),
    lodging_room_type: booking.lodgingRoomType ?? '',
    lodging_cost: booking.lodgingCost ? formatMoney(booking.lodgingCost) : '',
  };
}

/** Why a booking cannot be emailed, or null when it can. */
export function validateRecipient(booking) {
  if (!booking.bookingId) return 'Missing booking reference';
  if (!cleanEmail(booking.guestEmail)) return 'No guest email address';
  if (!booking.date) return 'No play date';
  return null;
}

/**
 * Enquiry emails scraped into the database sometimes keep the `mailto:` prefix
 * and stray angle brackets from the original header.
 */
export function cleanEmail(value) {
  if (!value) return null;
  let email = String(value).trim().replace(/^<|>$/g, '');
  if (email.toLowerCase().startsWith('mailto:')) email = email.slice(7);
  email = email.trim();
  return email.includes('@') ? email : null;
}

/** Today in the club's own time zone — the server runs on UTC. */
export function todayInClubZone(now = new Date(), timeZone = BRAND.timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const LONG_DATE_PARTS = new Intl.DateTimeFormat(BRAND.locale, {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * 'Wednesday 18 March 2026' — the club's `%A %d %B %Y`. Assembled from the
 * parts rather than formatted whole, because en-GB puts a comma after the
 * weekday and the existing SendGrid templates were written without one.
 */
function formatLongDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(isoDate);

  const parts = Object.fromEntries(
    LONG_DATE_PARTS.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

function formatMoney(value) {
  const amount = Number(value);
  return new Intl.NumberFormat(BRAND.locale, {
    style: 'currency',
    currency: BRAND.currency,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function nameFromEmail(email) {
  const local = cleanEmail(email)?.split('@')[0] ?? 'Guest';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
