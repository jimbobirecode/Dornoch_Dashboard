/**
 * Runtime column detection.
 *
 * This dashboard runs against installs at different migration levels, so a
 * column the code knows about may simply not exist yet. Every query is built
 * from the columns the database actually has, and missing ones are selected as
 * NULL — the same tolerance `modules/database/bookings.py` has.
 */
import { query } from '../db.js';

/** Without these the dashboard cannot render a booking at all. */
export const REQUIRED_COLUMNS = [
  'booking_id',
  'guest_email',
  'date',
  'tee_time',
  'players',
  'total',
  'status',
  'note',
  'club',
];

/** Added by later migrations; absent ones fall back to NULL. */
export const OPTIONAL_COLUMNS = [
  'id',
  'timestamp',
  'created_at',
  'customer_confirmed_at',
  'updated_at',
  'updated_by',
  'hotel_required',
  'hotel_checkin',
  'hotel_checkout',
  'golf_courses',
  'selected_tee_times',
  'lodging_nights',
  'lodging_rooms',
  'lodging_room_type',
  'lodging_preferences',
  'lodging_cost',
  'resort_fee_per_person',
  'resort_fee_total',
  'guest_name',
  'contact_phone',
  'caddie_requirements',
  'special_requests',
  'form_submitted_at',
  'pre_arrival_email_sent_at',
  'post_play_email_sent_at',
];

const USER_COLUMNS = [
  'id',
  'username',
  'password_hash',
  'temp_password',
  'customer_id',
  'full_name',
  'is_active',
  'must_change_password',
  'last_login',
];

// The schema cannot change under a running process, so the lookup is done once
// per table. The promise itself is cached so concurrent requests share it, and
// a failed lookup is dropped so the next request retries.
const cache = new Map();

async function describe(table, known) {
  const { rows } = await query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );

  const present = new Set(rows.map((row) => row.column_name));
  const has = (column) => present.has(column);

  return {
    has,
    present,
    /**
     * A SELECT list covering every column the code reads, with the ones this
     * install lacks aliased to NULL so the shape is always the same.
     */
    selectList: known
      .map((column) => (present.has(column) ? `"${column}"` : `NULL AS "${column}"`))
      .join(', '),
  };
}

function cached(table, known) {
  if (!cache.has(table)) {
    cache.set(
      table,
      describe(table, known).catch((err) => {
        cache.delete(table);
        throw err;
      }),
    );
  }
  return cache.get(table);
}

export function getBookingColumns() {
  return cached('bookings', [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);
}

export function getUserColumns() {
  return cached('dashboard_users', USER_COLUMNS);
}

/** Only for tests and the seed path, which can create tables mid-process. */
export function resetSchemaCache() {
  cache.clear();
}

/**
 * The `updated_at` / `updated_by` half of an UPDATE's SET clause, skipping
 * whichever audit columns this install does not have.
 *
 * `startIndex` is the first free placeholder number in the caller's query;
 * the returned `values` are meant to be spliced in at that position.
 */
export function buildAuditSet(columns, startIndex, username) {
  const clauses = [];
  const values = [];

  if (columns.has('updated_at')) clauses.push('updated_at = NOW()');

  if (columns.has('updated_by') && username) {
    values.push(username);
    clauses.push(`updated_by = $${startIndex + values.length - 1}`);
  }

  return { clauses, values };
}
