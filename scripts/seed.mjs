/**
 * Seed the dashboard with realistic sample bookings.
 *
 *   npm run seed              -- add sample data, keep anything already there
 *   npm run seed -- --reset   -- remove previously seeded rows first
 *
 * Safety: every row this writes carries the DEMO_PREFIX booking_id, and
 * --reset only ever deletes rows matching that prefix. Real bookings are
 * never touched.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../server/src/db.js';
import { BRAND } from '../server/src/lib/brand.js';

const DEMO_PREFIX = 'RD-DEMO-';
const USERNAME = process.env.SEED_USERNAME ?? 'demo';

const FIRST_NAMES = [
  'James', 'Sarah', 'Michael', 'Fiona', 'David', 'Aoife', 'Thomas', 'Claire',
  'Robert', 'Niamh', 'William', 'Emma', 'Patrick', 'Hannah', 'Andrew', 'Laura',
  'Stephen', 'Rachel', 'Conor', 'Megan', 'Daniel', 'Sophie', 'Mark', 'Orla',
];
const LAST_NAMES = [
  'Harrington', 'McAllister', 'Donnelly', 'Whitfield', 'O’Connor', 'Brennan',
  'Fitzgerald', 'Kavanagh', 'Sinclair', 'Doherty', 'Armstrong', 'Gallagher',
  'Pemberton', 'Hughes', 'Caldwell', 'Redmond', 'Thornton', 'Mulligan',
];
const DOMAINS = ['gmail.com', 'outlook.com', 'btinternet.com', 'yahoo.co.uk', 'me.com'];

const COURSES = [
  { name: 'Championship Course', fee: 295, weight: 6 },
  { name: 'Struie Course', fee: 95, weight: 3 },
  { name: 'Championship Course, Struie Course', fee: 360, weight: 2 },
];

// The sheet runs in roughly 10-minute intervals.
const TEE_TIMES = [
  '07:20 AM', '07:40 AM', '08:00 AM', '08:20 AM', '08:50 AM', '09:10 AM',
  '09:40 AM', '10:04 AM', '10:24 AM', '10:50 AM', '11:20 AM', '11:50 AM',
  '12:30 PM', '01:10 PM', '01:40 PM', '02:20 PM', '02:50 PM', '03:30 PM',
];

const SOURCES = [
  'Enquiry received via the website booking form.',
  'Enquiry forwarded from the pro shop inbox.',
  'Telephone enquiry, details taken by reception.',
  'Enquiry received via the tour operator portal.',
];

const EXTRA_NOTES = [
  'Group is travelling from the US and would prefer a morning slot.',
  'Two of the party are members at a partner club.',
  'Buggy required for one player (medical).',
  'Celebrating a 50th birthday, asked about a table in the clubhouse after.',
  'Flexible on time if the requested slot is unavailable.',
  'Return visitors — played the Championship Course in 2024.',
  'Would like caddies arranged for all players if possible.',
  'Asked whether clubs can be hired on the day.',
  'Playing the Highland loop, also booked at Brora and Castle Stuart that week.',
  '',
  '',
];

/**
 * Status mix of a realistic pipeline: plenty of new enquiries at the top,
 * fewer surviving to Booked, with a tail of rejections and cancellations.
 */
const STATUS_MIX = [
  ...Array(9).fill('Inquiry'),
  ...Array(2).fill('Pending'),
  ...Array(7).fill('Requested'),
  ...Array(6).fill('Confirmed'),
  ...Array(8).fill('Booked'),
  ...Array(2).fill('Rejected'),
  ...Array(2).fill('Cancelled'),
];

// Deterministic PRNG so re-seeding produces the same believable data set.
let seedState = 20260911;
function random() {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
const pick = (list) => list[Math.floor(random() * list.length)];

function pickCourse() {
  const total = COURSES.reduce((sum, course) => sum + course.weight, 0);
  let roll = random() * total;
  for (const course of COURSES) {
    roll -= course.weight;
    if (roll <= 0) return course;
  }
  return COURSES[0];
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function buildNote({ name, email, teeDate, teeTime, players, course }) {
  const extra = pick(EXTRA_NOTES);
  return [
    pick(SOURCES),
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    `Course: ${course.name}`,
    `Date: ${teeDate.toDateString()}`,
    `Time: ${teeTime}`,
    `Players: ${players}`,
    extra ? `\n${extra}` : '',
  ]
    .join('\n')
    .trim();
}

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.dashboard_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      temp_password TEXT,
      customer_id TEXT NOT NULL,
      full_name TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      must_change_password BOOLEAN DEFAULT FALSE,
      last_login TIMESTAMPTZ
    )`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.bookings (
      id SERIAL PRIMARY KEY,
      booking_id TEXT UNIQUE NOT NULL,
      guest_email TEXT,
      date DATE,
      tee_time TEXT,
      players INTEGER,
      total NUMERIC(10,2),
      status TEXT,
      note TEXT,
      club TEXT,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      customer_confirmed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ,
      updated_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      hotel_required BOOLEAN DEFAULT FALSE,
      hotel_checkin DATE,
      hotel_checkout DATE,
      golf_courses TEXT,
      selected_tee_times TEXT,
      guest_name TEXT,
      pre_arrival_email_sent_at TIMESTAMPTZ,
      post_play_email_sent_at TIMESTAMPTZ
    )`);

  await client.query(
    'CREATE INDEX IF NOT EXISTS bookings_club_date_idx ON public.bookings (club, date)',
  );
}

/**
 * Seeded rows are only visible to a user whose customer_id matches the row's
 * club, so guessing wrong makes the dashboard look empty. Prefer the club the
 * existing dashboard users are actually on.
 */
async function resolveClub(client) {
  if (process.env.SEED_CLUB) return process.env.SEED_CLUB;

  const { rows } = await client.query(
    `SELECT customer_id, COUNT(*)::int AS users
       FROM public.dashboard_users
      WHERE customer_id IS NOT NULL
      GROUP BY customer_id
      ORDER BY users DESC`,
  );

  if (rows.length === 1) {
    console.log(`Using club "${rows[0].customer_id}" (from the existing dashboard user).`);
    return rows[0].customer_id;
  }

  if (rows.length > 1) {
    console.error('Several clubs exist on this database:');
    for (const row of rows) console.error(`  ${row.customer_id} (${row.users} user(s))`);
    console.error('Re-run with SEED_CLUB set to the one you want.');
    process.exit(1);
  }

  // A fresh database gets this install's own club id. An existing one is
  // never re-labelled — the branches above take the club from its own rows,
  // because customer_id is data and renaming it would orphan every booking.
  console.log(`No dashboard users yet — using club "${BRAND.clubId}".`);
  return BRAND.clubId;
}

async function ensureUser(client, CLUB) {
  const { rows } = await client.query(
    'SELECT id FROM public.dashboard_users WHERE username = $1',
    [USERNAME],
  );

  if (rows.length) {
    console.log(`User "${USERNAME}" already exists — password left unchanged.`);
    return null;
  }

  // A random password unless one is supplied, so a public deployment never
  // ends up with a guessable default.
  const password = process.env.SEED_PASSWORD ?? crypto.randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(password, 12);

  await client.query(
    `INSERT INTO public.dashboard_users
       (username, password_hash, customer_id, full_name, is_active, must_change_password)
     VALUES ($1, $2, $3, $4, TRUE, FALSE)`,
    [USERNAME, hash, CLUB, 'Demo Manager'],
  );

  return password;
}

function buildBookings(count) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const bookings = [];

  for (let i = 0; i < count; i += 1) {
    // Tee dates from 21 days back to ~100 days ahead, so both the trend
    // line and the "next 30 days" default view have something in them.
    const dayOffset = Math.floor(random() * 121) - 21;
    const teeDate = new Date(today);
    teeDate.setUTCDate(teeDate.getUTCDate() + dayOffset);

    // Weekends draw more play; skip roughly half of midweek candidates.
    const weekday = teeDate.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    if (!isWeekend && random() < 0.35) continue;

    const course = pickCourse();
    const players = [1, 2, 2, 3, 4, 4, 4][Math.floor(random() * 7)];
    const teeTime = pick(TEE_TIMES);
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const name = `${first} ${last}`;
    const email = `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}@${pick(DOMAINS)}`;

    let status = pick(STATUS_MIX);
    // A past tee date can't still be an open enquiry.
    if (dayOffset < 0 && ['Inquiry', 'Pending', 'Requested'].includes(status)) {
      status = random() < 0.8 ? 'Booked' : 'Cancelled';
    }

    // Enquiries arrive well before the tee date.
    const requestedAt = new Date(teeDate);
    requestedAt.setUTCDate(requestedAt.getUTCDate() - (3 + Math.floor(random() * 45)));
    requestedAt.setUTCHours(7 + Math.floor(random() * 12), Math.floor(random() * 60));
    const cappedRequestedAt = requestedAt > new Date() ? new Date() : requestedAt;

    const hotelRequired = random() < 0.28;
    const hotelCheckin = new Date(teeDate);
    hotelCheckin.setUTCDate(hotelCheckin.getUTCDate() - 1);
    const hotelCheckout = new Date(teeDate);
    hotelCheckout.setUTCDate(hotelCheckout.getUTCDate() + 1 + Math.floor(random() * 2));

    const touched = ['Confirmed', 'Booked', 'Rejected', 'Cancelled'].includes(status);

    bookings.push({
      bookingId: `${DEMO_PREFIX}${String(1000 + bookings.length)}`,
      email,
      date: isoDate(teeDate),
      // A few rows deliberately have no tee_time so "Fix tee times" has
      // something to extract from the note.
      teeTime: random() < 0.12 ? null : teeTime,
      players,
      total: (course.fee * players).toFixed(2),
      status,
      note: buildNote({ name, email, teeDate, teeTime, players, course }),
      timestamp: cappedRequestedAt.toISOString(),
      updatedAt: touched ? new Date().toISOString() : null,
      updatedBy: touched ? USERNAME : null,
      hotelRequired,
      hotelCheckin: hotelRequired ? isoDate(hotelCheckin) : null,
      hotelCheckout: hotelRequired ? isoDate(hotelCheckout) : null,
      course: course.name,
      teeTimeLabel: teeTime,
    });
  }

  return bookings;
}

export async function seed({ client, reset = false } = {}) {
  // Schema first: resolveClub reads dashboard_users, which may not exist yet.
  await ensureSchema(client);
  const CLUB = await resolveClub(client);
  {

    if (reset) {
      const { rowCount } = await client.query(
        'DELETE FROM public.bookings WHERE booking_id LIKE $1',
        [`${DEMO_PREFIX}%`],
      );
      console.log(`--reset: removed ${rowCount} previously seeded booking(s).`);
    }

    const password = await ensureUser(client, CLUB);
    const bookings = buildBookings(150);

    let inserted = 0;
    for (const booking of bookings) {
      const { rowCount } = await client.query(
        `INSERT INTO public.bookings
           (booking_id, guest_email, date, tee_time, players, total, status, note, club,
            timestamp, created_at, updated_at, updated_by,
            hotel_required, hotel_checkin, hotel_checkout, golf_courses, selected_tee_times)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (booking_id) DO NOTHING`,
        [
          booking.bookingId,
          booking.email,
          booking.date,
          booking.teeTime,
          booking.players,
          booking.total,
          booking.status,
          booking.note,
          CLUB,
          booking.timestamp,
          booking.updatedAt,
          booking.updatedBy,
          booking.hotelRequired,
          booking.hotelCheckin,
          booking.hotelCheckout,
          booking.course,
          booking.teeTime ? booking.teeTimeLabel : '',
        ],
      );
      inserted += rowCount;
    }

    const { rows } = await client.query(
      `SELECT status, COUNT(*)::int AS count
         FROM public.bookings
        WHERE club = $1 AND booking_id LIKE $2
        GROUP BY status ORDER BY count DESC`,
      [CLUB, `${DEMO_PREFIX}%`],
    );

    console.log(`\nSeeded ${inserted} booking(s) for club "${CLUB}".`);
    console.log(rows.map((row) => `  ${row.status.padEnd(10)} ${row.count}`).join('\n'));

    if (password) {
      console.log(`\n  Sign in with:  ${USERNAME} / ${password}`);
      console.log('  Save it now — it is not stored anywhere and is not shown again.');
    }
    if (!inserted && !reset) {
      console.log('\nNothing new inserted. Re-run with --reset to rebuild the sample data.');
    }

    return { club: CLUB, inserted, password };
  }
}

/** Run as a CLI only when invoked directly, not when imported by the server. */
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Point it at the dashboard database and retry.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await seed({ client, reset: process.argv.includes('--reset') });
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
