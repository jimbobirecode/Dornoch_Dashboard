import { Router } from 'express';
import ExcelJS from 'exceljs';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import {
  ALLOWED_STATUSES,
  extractTeeTimeFromNote,
  serialiseBooking,
} from '../lib/bookings-domain.js';
import { buildAuditSet, getBookingColumns } from '../lib/schema.js';

const router = Router();
router.use(requireAuth);

async function loadBookings(club) {
  const columns = await getBookingColumns();
  // Older installs may not have a timestamp column to order by.
  const orderBy = columns.has('timestamp')
    ? 'ORDER BY timestamp DESC'
    : columns.has('created_at')
      ? 'ORDER BY created_at DESC'
      : 'ORDER BY id DESC';

  const { rows } = await query(
    `SELECT ${columns.selectList}
       FROM public.bookings
      WHERE club = $1
      ${orderBy}`,
    [club],
  );
  return rows.map(serialiseBooking);
}

/** One-column update that only writes audit fields the table actually has. */
async function updateBookingField({ column, value, bookingId, club, username }) {
  const columns = await getBookingColumns();
  const audit = buildAuditSet(columns, 3, username);

  const { rows } = await query(
    `UPDATE public.bookings
        SET "${column}" = $1${audit.clauses.length ? `, ${audit.clauses.join(', ')}` : ''}
      WHERE booking_id = $2 AND club = $${3 + audit.values.length}
    RETURNING ${columns.selectList}`,
    [value, bookingId, ...audit.values, club],
  );

  return rows[0] ? serialiseBooking(rows[0]) : null;
}

router.get('/', async (req, res, next) => {
  try {
    res.json({ bookings: await loadBookings(req.user.customerId) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:bookingId/status', async (req, res, next) => {
  const { status } = req.body ?? {};
  if (!ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Unknown status: ${status}` });
  }

  try {
    const booking = await updateBookingField({
      column: 'status',
      value: status,
      bookingId: req.params.bookingId,
      club: req.user.customerId,
      username: req.user.username,
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

router.patch('/:bookingId/note', async (req, res, next) => {
  const { note } = req.body ?? {};
  if (typeof note !== 'string') {
    return res.status(400).json({ error: 'note must be a string' });
  }

  try {
    const booking = await updateBookingField({
      column: 'note',
      value: note,
      bookingId: req.params.bookingId,
      club: req.user.customerId,
      username: req.user.username,
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

router.patch('/:bookingId/tee-time', async (req, res, next) => {
  const { teeTime } = req.body ?? {};
  if (typeof teeTime !== 'string' || !teeTime.trim()) {
    return res.status(400).json({ error: 'teeTime is required' });
  }

  try {
    const booking = await updateBookingField({
      column: 'tee_time',
      value: teeTime.trim(),
      bookingId: req.params.bookingId,
      club: req.user.customerId,
      username: req.user.username,
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

router.delete('/:bookingId', async (req, res, next) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM public.bookings WHERE booking_id = $1 AND club = $2',
      [req.params.bookingId, req.user.customerId],
    );
    if (!rowCount) return res.status(404).json({ error: 'Booking not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Backfill tee_time from the stored email body for rows that never got one. */
router.post('/fix-tee-times', async (req, res, next) => {
  try {
    const columns = await getBookingColumns();
    if (!columns.has('note') || !columns.has('tee_time')) {
      return res.status(400).json({
        error: 'This install has no note/tee_time columns to extract from.',
      });
    }

    const { rows } = await query(
      `SELECT booking_id, note
         FROM public.bookings
        WHERE club = $1
          AND (tee_time IS NULL OR tee_time = 'Not Specified' OR tee_time = '')`,
      [req.user.customerId],
    );

    let updated = 0;
    for (const row of rows) {
      const teeTime = extractTeeTimeFromNote(row.note);
      if (!teeTime) continue;
      await query(
        `UPDATE public.bookings SET tee_time = $1${
          columns.has('updated_at') ? ', updated_at = NOW()' : ''
        } WHERE booking_id = $2`,
        [teeTime, row.booking_id],
      );
      updated += 1;
    }

    res.json({ updated, notFound: rows.length - updated });
  } catch (err) {
    next(err);
  }
});

const EXPORT_COLUMNS = [
  ['bookingId', 'Booking ID'],
  ['guestName', 'Lead Guest'],
  ['guestEmail', 'Guest Email'],
  ['contactPhone', 'Phone'],
  ['date', 'Tee Date'],
  ['teeTime', 'Tee Time'],
  ['players', 'Players'],
  ['total', 'Total (GBP)'],
  ['status', 'Status'],
  ['golfCourses', 'Golf Courses'],
  ['selectedTeeTimes', 'Selected Tee Times'],
  ['caddieRequirements', 'Caddies'],
  ['specialRequests', 'Special Requests'],
  ['hotelRequired', 'Accommodation Required'],
  ['hotelCheckin', 'Check-In'],
  ['hotelCheckout', 'Check-Out'],
  ['updatedBy', 'Updated By'],
  ['updatedAt', 'Updated At'],
];

router.get('/export', async (req, res, next) => {
  const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  try {
    let bookings = await loadBookings(req.user.customerId);
    bookings = applyFilters(bookings, req.query);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="bookings_${stamp}.csv"`);
      return res.send(toCsv(bookings));
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Bookings');
    sheet.columns = EXPORT_COLUMNS.map(([key, header]) => ({ key, header, width: 20 }));
    sheet.getRow(1).font = { bold: true };
    bookings.forEach((booking) => sheet.addRow(booking));

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="bookings_${stamp}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

/** Same status/date narrowing the dashboard applies, so an export matches the view. */
export function applyFilters(bookings, { statuses, from, to } = {}) {
  let result = bookings;

  if (statuses) {
    const wanted = new Set(String(statuses).split(',').filter(Boolean));
    if (wanted.size) result = result.filter((b) => wanted.has(b.status));
  }
  if (from) result = result.filter((b) => b.date && b.date >= from);
  if (to) result = result.filter((b) => b.date && b.date <= to);

  return result;
}

function toCsv(bookings) {
  const header = EXPORT_COLUMNS.map(([, label]) => label).join(',');
  const lines = bookings.map((booking) =>
    EXPORT_COLUMNS.map(([key]) => csvCell(booking[key])).join(','),
  );
  return [header, ...lines].join('\n');
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default router;
