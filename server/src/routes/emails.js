/**
 * Customer-journey email campaigns: the pre-arrival welcome and the post-play
 * thank you, driven from the dashboard rather than a cron job.
 *
 * The browser only ever names a campaign and a set of booking references — the
 * rows themselves are re-read here, scoped to the signed-in user's club, so a
 * request cannot reach another club's guests.
 */
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { serialiseBooking } from '../lib/bookings-domain.js';
import { getBookingColumns } from '../lib/schema.js';
import {
  CAMPAIGN_IDS,
  buildTemplateData,
  campaignReady,
  cleanEmail,
  getCampaign,
  publicEmailConfig,
  readEmailConfig,
  selectCandidates,
  targetDate,
  todayInClubZone,
  validateRecipient,
} from '../lib/email-domain.js';
import { sendTemplateEmail } from '../lib/sendgrid.js';

const router = Router();
router.use(requireAuth);

/** A campaign run never sends more than this in one request. */
const MAX_BATCH = 200;

async function loadClubBookings(club) {
  const columns = await getBookingColumns();
  const { rows } = await query(
    `SELECT ${columns.selectList} FROM public.bookings WHERE club = $1`,
    [club],
  );
  return { bookings: rows.map(serialiseBooking), columns };
}

/**
 * Record the send. Installs that have not run
 * `migration_add_journey_emails.sql` have no column to write to — the email
 * still goes out, it just cannot be de-duplicated, which the page warns about.
 */
async function markSent(campaign, bookingId, club, columns) {
  if (!columns.has(campaign.column)) return false;
  await query(
    `UPDATE public.bookings SET "${campaign.column}" = NOW()
      WHERE booking_id = $1 AND club = $2`,
    [bookingId, club],
  );
  return true;
}

function resolveCampaign(req, res) {
  const id = req.query.campaign ?? req.body?.campaign;
  const campaign = getCampaign(id);
  if (!campaign) {
    res.status(400).json({ error: `Unknown campaign: ${id}. Expected one of ${CAMPAIGN_IDS.join(', ')}.` });
    return null;
  }
  return campaign;
}

/** What is configured, and whether sends can be de-duplicated. */
router.get('/config', async (req, res, next) => {
  try {
    const columns = await getBookingColumns();
    res.json({
      ...publicEmailConfig(readEmailConfig()),
      tracking: {
        pre_arrival: columns.has('pre_arrival_email_sent_at'),
        post_play: columns.has('post_play_email_sent_at'),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** The bookings a campaign would send to, due today or across the wider window. */
router.get('/pending', async (req, res, next) => {
  const campaign = resolveCampaign(req, res);
  if (!campaign) return;

  const scope = req.query.scope === 'all' ? 'all' : 'due';

  try {
    const config = readEmailConfig();
    const { days } = config.campaigns[campaign.id];
    const today = todayInClubZone();
    const { bookings } = await loadClubBookings(req.user.customerId);

    res.json({
      campaign: campaign.id,
      scope,
      days,
      today,
      targetDate: targetDate(campaign, days, today),
      bookings: selectCandidates(bookings, { campaign, days, today, scope }),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Send a campaign to the named bookings.
 *
 * `dryRun` walks the same path — same eligibility checks, same rendered
 * template data — and stops short of the SendGrid call, so a preview reports
 * exactly what a real run would do.
 */
router.post('/send', async (req, res, next) => {
  const campaign = resolveCampaign(req, res);
  if (!campaign) return;

  const { bookingIds, dryRun = false } = req.body ?? {};
  if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
    return res.status(400).json({ error: 'bookingIds must be a non-empty array' });
  }
  if (bookingIds.length > MAX_BATCH) {
    return res.status(400).json({ error: `Too many bookings in one run (max ${MAX_BATCH}).` });
  }

  const config = readEmailConfig();
  if (!dryRun && !campaignReady(config, campaign.id)) {
    return res.status(400).json({
      error: `Email is not configured. Missing: ${config.missing.join(', ')}.`,
    });
  }

  try {
    const { bookings, columns } = await loadClubBookings(req.user.customerId);
    const byId = new Map(bookings.map((booking) => [booking.bookingId, booking]));

    const results = [];
    let sent = 0;
    let failed = 0;
    let tracked = true;

    for (const bookingId of bookingIds) {
      const booking = byId.get(bookingId);
      if (!booking) {
        failed += 1;
        results.push({ bookingId, email: null, status: 'failed', message: 'Booking not found' });
        continue;
      }

      const problem = validateRecipient(booking);
      if (problem) {
        failed += 1;
        results.push({ bookingId, email: booking.guestEmail || null, status: 'failed', message: problem });
        continue;
      }

      const email = cleanEmail(booking.guestEmail);

      if (dryRun) {
        results.push({
          bookingId,
          email,
          status: 'would_send',
          message: booking[campaign.field]
            ? 'Dry run — already sent once, this would be a resend'
            : 'Dry run — not sent',
        });
        continue;
      }

      const outcome = await sendTemplateEmail({
        apiKey: config.apiKey,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        toEmail: email,
        templateId: config.campaigns[campaign.id].templateId,
        data: buildTemplateData(booking, { fromEmail: config.fromEmail }),
      });

      if (outcome.ok) {
        sent += 1;
        const recorded = await markSent(campaign, bookingId, req.user.customerId, columns);
        if (!recorded) tracked = false;
      } else {
        failed += 1;
      }

      results.push({
        bookingId,
        email,
        status: outcome.ok ? 'sent' : 'failed',
        message: outcome.message,
      });
    }

    res.json({ campaign: campaign.id, dryRun, sent, failed, tracked, results });
  } catch (err) {
    next(err);
  }
});

export default router;
