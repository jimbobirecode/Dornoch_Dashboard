/**
 * Read-only compatibility check for an existing dashboard database.
 *
 *   DATABASE_URL=... npm run check
 *
 * Writes nothing. Reports whether the JavaScript dashboard can run against
 * this install as-is, and names anything that needs attention.
 */
import 'dotenv/config';
import { pool } from '../server/src/db.js';
import { REQUIRED_COLUMNS, OPTIONAL_COLUMNS } from '../server/src/lib/schema.js';
import { ALLOWED_STATUSES } from '../server/src/lib/bookings-domain.js';

const problems = [];
const warnings = [];

const ok = (msg) => console.log(`  PASS  ${msg}`);
const warn = (msg) => { warnings.push(msg); console.log(`  WARN  ${msg}`); };
const fail = (msg) => { problems.push(msg); console.log(`  FAIL  ${msg}`); };

async function columnsOf(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return new Set(rows.map((r) => r.column_name));
}

async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1) AS present`,
    [table],
  );
  return rows[0].present;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const { rows: [{ version }] } = await client.query('SELECT version()');
    console.log(`\nConnected: ${version.split(',')[0]}\n`);

    console.log('Tables');
    const hasBookings = await tableExists(client, 'bookings');
    const hasUsers = await tableExists(client, 'dashboard_users');
    hasBookings ? ok('public.bookings exists') : fail('public.bookings is missing');
    hasUsers ? ok('public.dashboard_users exists') : fail('public.dashboard_users is missing');
    if (!hasBookings || !hasUsers) return;

    console.log('\nBookings columns');
    const bookingCols = await columnsOf(client, 'bookings');
    for (const col of REQUIRED_COLUMNS) {
      bookingCols.has(col) ? ok(`${col} (required)`) : fail(`${col} is required and missing`);
    }
    const missingOptional = OPTIONAL_COLUMNS.filter((col) => !bookingCols.has(col));
    if (missingOptional.length) {
      warn(`absent, will fall back to defaults: ${missingOptional.join(', ')}`);
    } else {
      ok('all optional columns present');
    }

    console.log('\nUser accounts');
    const userCols = await columnsOf(client, 'dashboard_users');
    for (const col of ['username', 'customer_id', 'is_active']) {
      userCols.has(col) ? ok(`${col}`) : fail(`dashboard_users.${col} is required and missing`);
    }
    for (const col of ['password_hash', 'temp_password', 'must_change_password']) {
      userCols.has(col) ? ok(`${col}`) : warn(`dashboard_users.${col} missing — that login path is unavailable`);
    }

    if (userCols.has('password_hash')) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE password_hash LIKE '$2%')::int AS bcrypt
           FROM public.dashboard_users`,
      );
      const { total, bcrypt } = rows[0];
      if (total === 0) warn('no user accounts exist yet');
      else if (bcrypt === total) ok(`${total} account(s), all bcrypt hashes — passwords carry over unchanged`);
      else warn(`${total - bcrypt} of ${total} account(s) have a non-bcrypt password_hash and will not be able to sign in`);
    }

    console.log('\nClub scoping');
    const { rows: clubRows } = await client.query(
      `SELECT club, COUNT(*)::int AS bookings FROM public.bookings
        GROUP BY club ORDER BY bookings DESC`,
    );
    const { rows: userClubRows } = await client.query(
      `SELECT customer_id, COUNT(*)::int AS users FROM public.dashboard_users
        GROUP BY customer_id`,
    );
    console.log(`        bookings by club: ${clubRows.map((r) => `${r.club}=${r.bookings}`).join(', ') || 'none'}`);
    console.log(`        users by club:    ${userClubRows.map((r) => `${r.customer_id}=${r.users}`).join(', ') || 'none'}`);

    const bookingClubs = new Set(clubRows.map((r) => r.club));
    const orphanUsers = userClubRows.filter((r) => !bookingClubs.has(r.customer_id));
    if (orphanUsers.length && bookingClubs.size) {
      warn(`users on ${orphanUsers.map((r) => r.customer_id).join(', ')} have no bookings — their dashboard will look empty`);
    } else {
      ok('every user club has bookings');
    }

    console.log('\nTour operators');
    const hasOperators = await tableExists(client, 'tour_operators');
    const tradeColumns = ['tour_operator_id', 'payment_status', 'amount_paid'];
    const reminderColumns = ['operator_status_email_sent_at', 'operator_payment_email_sent_at'];
    const missingTrade = tradeColumns.filter((col) => !bookingCols.has(col));
    const missingReminder = reminderColumns.filter((col) => !bookingCols.has(col));

    if (hasOperators && !missingTrade.length && !missingReminder.length) {
      const { rows: [{ count }] } = await client.query(
        'SELECT COUNT(*)::int AS count FROM public.tour_operators',
      );
      ok(`public.tour_operators exists (${count} account(s)) with every booking column`);
    } else if (!hasOperators) {
      // Not a failure: the rest of the dashboard runs without it, the Tour
      // Operators and Operator Reminders pages simply say what to run.
      warn('public.tour_operators is missing — run migration_add_tour_operators.sql to enable trade accounts, credit terms and operator reminders');
    } else {
      if (missingTrade.length) {
        warn(`bookings is missing ${missingTrade.join(', ')} — accounts can be set up but nothing can be assigned or paid against them; run migration_add_tour_operators.sql`);
      }
      if (missingReminder.length) {
        warn(`bookings is missing ${missingReminder.join(', ')} — operator reminders send but cannot be de-duplicated; run migration_add_tour_operators.sql`);
      }
    }

    console.log('\nStatus values');
    const { rows: statusRows } = await client.query(
      'SELECT DISTINCT status FROM public.bookings WHERE status IS NOT NULL',
    );
    const unknown = statusRows.map((r) => r.status).filter((s) => !ALLOWED_STATUSES.includes(s));
    if (unknown.length) {
      warn(`statuses the dashboard does not know: ${unknown.join(', ')} — those rows show but cannot be filtered by the status tiles`);
    } else {
      ok(`all statuses recognised (${statusRows.map((r) => r.status).join(', ') || 'none'})`);
    }

    console.log('\n' + '-'.repeat(60));
    if (problems.length) {
      console.log(`NOT READY — ${problems.length} blocking problem(s):`);
      problems.forEach((p) => console.log(`  - ${p}`));
      process.exitCode = 1;
    } else if (warnings.length) {
      console.log(`READY, with ${warnings.length} thing(s) to be aware of:`);
      warnings.forEach((w) => console.log(`  - ${w}`));
      console.log('\nNone of these require a schema change.');
    } else {
      console.log('READY — this install can run the dashboard with no changes.');
    }
    console.log('Nothing was written to the database.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Check failed:', err.message);
  process.exit(1);
});
