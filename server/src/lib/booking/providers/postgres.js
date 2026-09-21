/**
 * The tee sheet in this database, as a provider.
 *
 * This is the proof of concept: Royal Dornoch books through these tables while
 * Cabot books through Agilysys, and both answer the interface in
 * `../engine.js`. Keeping the two behind one interface is what makes the
 * booking pages club-agnostic.
 *
 * Holding a slot is the only genuinely delicate part. `reserve` decrements
 * `available_count` under a row lock and refuses to take it below zero, so two
 * guests racing for the last place in a four-ball cannot both win.
 */
import { randomUUID } from 'node:crypto';
import { query, pool } from '../../../db.js';
import { quoteLine } from '../engine-domain.js';

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** A `golf_rate_types` row in the engine's rate shape. */
function toRate(row) {
  return {
    rateRef: String(row.rate_ref),
    tariffRef: row.tariff_ref ?? null,
    playerTypeRef: row.player_type_ref ?? null,
    name: row.name,
    holeType: Number(row.hole_type) || 18,
    isPrivate: row.is_private === true,
    minimumPlayers: Number(row.minimum_players) || 0,
    guaranteeType: 'None',
    rates: {
      greenFee: money(row.green_fee),
      cartFee: money(row.cart_fee),
      otherFee: money(row.other_fee),
    },
    taxPercent: Number(row.tax_percent) || 0,
    depositPercent: row.deposit_percent === null ? 100 : Number(row.deposit_percent),
  };
}

/** `TIMESTAMP` reads back as a Date; the engine speaks local wall-clock text. */
function localDateTime(value) {
  if (typeof value === 'string') return value.slice(0, 19);
  const pad = (number) => String(number).padStart(2, '0');
  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
    `T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  );
}

function localDate(value) {
  return typeof value === 'string' ? value.slice(0, 10) : localDateTime(value).slice(0, 10);
}

export function provider(club) {
  return {
    async courses() {
      const { rows } = await query(
        `SELECT id, course_ref, name, hole_type, request_only, list_order, image_url
           FROM public.golf_courses
          WHERE club = $1 AND active = TRUE
          ORDER BY list_order, name`,
        [club],
      );

      return rows.map((row) => ({
        courseId: row.id,
        courseRef: String(row.course_ref),
        name: row.name,
        holeType: Number(row.hole_type) || 18,
        requestOnly: row.request_only === true,
        listOrder: Number(row.list_order) || 0,
        imageUrl: row.image_url ?? null,
      }));
    },

    /**
     * Every course's slots across a date range, with the rates each slot can be
     * sold at — the shape Agilysys `multiCourse` returns.
     *
     * A slot's `rate_refs` narrows the course's rates to the ones that apply at
     * that time (an early-bird tariff, say); empty means all of them. The join
     * is done here rather than in SQL because the empty case is "everything",
     * which an inner join cannot express.
     */
    async availability({ fromDate, toDate }) {
      const [courses, slotRows, rateRows] = await Promise.all([
        this.courses(),
        query(
          `SELECT id, course_id, tee_time_ref, scheduled_at, available_count,
                  hole_number, allocation_code, allocation_name, rate_refs
             FROM public.golf_tee_sheet
            WHERE club = $1 AND play_date BETWEEN $2 AND $3
              AND blocked = FALSE AND available_count > 0
            ORDER BY scheduled_at`,
          [club, fromDate, toDate ?? fromDate],
        ),
        query(
          `SELECT id, course_id, rate_ref, tariff_ref, player_type_ref, name, hole_type,
                  green_fee, cart_fee, other_fee, tax_percent, deposit_percent,
                  minimum_players, is_private
             FROM public.golf_rate_types
            WHERE club = $1 AND active = TRUE
            ORDER BY green_fee DESC`,
          [club],
        ),
      ]);

      const ratesByCourse = new Map();
      for (const row of rateRows.rows) {
        if (!ratesByCourse.has(row.course_id)) ratesByCourse.set(row.course_id, []);
        ratesByCourse.get(row.course_id).push(toRate(row));
      }

      const slotsByCourse = new Map();
      for (const row of slotRows.rows) {
        const courseRates = ratesByCourse.get(row.course_id) ?? [];
        const limited = row.rate_refs?.length
          ? courseRates.filter((rate) => row.rate_refs.includes(rate.rateRef))
          : courseRates;
        if (!limited.length) continue;

        if (!slotsByCourse.has(row.course_id)) slotsByCourse.set(row.course_id, []);
        slotsByCourse.get(row.course_id).push({
          slotId: row.id,
          scheduledDateTime: localDateTime(row.scheduled_at),
          availableCount: Number(row.available_count) || 0,
          holeNumber: String(row.hole_number ?? '1'),
          teeTimeRef: row.tee_time_ref ?? null,
          allocationCode: row.allocation_code ?? 'ALL',
          allocationName: row.allocation_name ?? 'ALL',
          rateTypes: limited,
        });
      }

      return courses
        .map((course) => ({ ...course, slots: slotsByCourse.get(course.courseId) ?? [] }))
        .filter((course) => course.slots.length > 0);
    },

    /**
     * Re-quote lines against the sheet as it stands now.
     *
     * This is both the price check and the availability check, as `getPrice` is
     * for Agilysys: a slot that has sold out since it was added comes back
     * `available: false` rather than throwing, so a cart can show one dead line
     * beside three good ones.
     */
    async price(lines) {
      const quotes = [];

      for (const line of lines) {
        const { rows } = await query(
          `SELECT s.id AS slot_id, s.available_count, s.scheduled_at,
                  c.name AS course_name, c.image_url,
                  r.id AS rate_id, r.rate_ref, r.tariff_ref, r.player_type_ref, r.name,
                  r.hole_type, r.green_fee, r.cart_fee, r.other_fee, r.tax_percent,
                  r.deposit_percent, r.minimum_players, r.is_private
             FROM public.golf_tee_sheet s
             JOIN public.golf_courses c ON c.id = s.course_id
             JOIN public.golf_rate_types r ON r.course_id = c.id AND r.rate_ref = $4
            WHERE s.club = $1 AND c.course_ref = $2 AND s.scheduled_at = $3
              AND s.blocked = FALSE AND r.active = TRUE`,
          [club, String(line.courseRef), line.scheduledDateTime, String(line.rateRef)],
        );

        const row = rows[0];
        if (!row) {
          quotes.push({
            itemId: line.itemId ?? null,
            courseRef: String(line.courseRef),
            scheduledDateTime: line.scheduledDateTime,
            available: false,
            availableSlots: 0,
            rateRef: String(line.rateRef),
            quote: null,
          });
          continue;
        }

        const rate = toRate(row);
        const players = Math.max(1, Number(line.players) || 1);
        const enough = Number(row.available_count) >= players;

        quotes.push({
          itemId: line.itemId ?? null,
          slotId: row.slot_id,
          rateId: row.rate_id,
          courseRef: String(line.courseRef),
          scheduledDateTime: localDateTime(row.scheduled_at),
          available: enough && rate.minimumPlayers <= players,
          availableSlots: Number(row.available_count) || 0,
          rateRef: rate.rateRef,
          rateName: rate.name,
          courseName: row.course_name,
          imageUrl: row.image_url ?? null,
          quote: quoteLine({
            rate,
            players,
            caddies: line.caddies,
            caddieFee: line.caddieFee,
          }),
        });
      }

      return quotes;
    },

    async caddieTypes() {
      const { rows } = await query(
        `SELECT caddie_ref, name, bag_value, fee
           FROM public.golf_caddie_types
          WHERE club = $1 AND active = TRUE
          ORDER BY bag_value, name`,
        [club],
      );

      return rows.map((row) => ({
        caddieRef: String(row.caddie_ref),
        name: row.name,
        bagValue: Number(row.bag_value) || 1,
        fee: money(row.fee),
      }));
    },

    /**
     * Take the places a paid cart needs, all of them or none.
     *
     * `SELECT ... FOR UPDATE` serialises two guests reaching the last slot, and
     * the `available_count >= $2` guard is what actually refuses the second —
     * without it the decrement would happily go negative and both would be told
     * they had a tee time.
     */
    async reserve(lines) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const taken = [];

        for (const line of lines) {
          const { rows } = await client.query(
            `SELECT s.id, s.available_count
               FROM public.golf_tee_sheet s
               JOIN public.golf_courses c ON c.id = s.course_id
              WHERE s.club = $1 AND c.course_ref = $2 AND s.scheduled_at = $3
                AND s.blocked = FALSE
              FOR UPDATE OF s`,
            [club, String(line.courseRef), line.scheduledDateTime],
          );

          const slot = rows[0];
          const players = Math.max(1, Number(line.players) || 1);
          if (!slot || Number(slot.available_count) < players) {
            await client.query('ROLLBACK');
            return {
              ok: false,
              soldOut: {
                courseRef: String(line.courseRef),
                scheduledDateTime: line.scheduledDateTime,
                remaining: slot ? Number(slot.available_count) : 0,
              },
            };
          }

          await client.query(
            `UPDATE public.golf_tee_sheet
                SET available_count = available_count - $2
              WHERE id = $1 AND available_count >= $2`,
            [slot.id, players],
          );
          taken.push({ slotId: slot.id, players });
        }

        await client.query('COMMIT');
        return { ok: true, taken };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    /** Give the places back, for a cancellation or a payment that failed. */
    async release(lines) {
      for (const line of lines) {
        await query(
          `UPDATE public.golf_tee_sheet s
              SET available_count = available_count + $4
             FROM public.golf_courses c
            WHERE c.id = s.course_id AND s.club = $1
              AND c.course_ref = $2 AND s.scheduled_at = $3`,
          [club, String(line.courseRef), line.scheduledDateTime, Math.max(1, Number(line.players) || 1)],
        );
      }
    },
  };
}

/** Carts live in this database whichever provider owns the tee sheet. */
export const carts = {
  async create(club, locale = 'EN') {
    const id = randomUUID();
    await query(
      `INSERT INTO public.booking_carts (id, club, locale, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')`,
      [id, club, locale],
    );
    return id;
  },

  async get(club, cartId) {
    const { rows } = await query(
      `SELECT id, club, locale, guest, created_at, updated_at
         FROM public.booking_carts
        WHERE id = $1 AND club = $2`,
      [cartId, club],
    );
    return rows[0] ?? null;
  },

  async items(club, cartId) {
    const { rows } = await query(
      `SELECT id, scheduled_at, play_date, players, holes, caddie_type_ref, caddies,
              quote, created_at, course_ref, course_name, rate_ref, rate_name, image_url
         FROM public.booking_cart_items
        WHERE cart_id = $1 AND club = $2
        ORDER BY scheduled_at`,
      [cartId, club],
    );

    return rows.map((row) => ({
      id: row.id,
      courseRef: String(row.course_ref),
      courseName: row.course_name,
      imageUrl: row.image_url ?? null,
      rateRef: String(row.rate_ref),
      rateName: row.rate_name,
      scheduledDateTime: localDateTime(row.scheduled_at),
      date: localDate(row.play_date),
      players: Number(row.players) || 1,
      holes: Number(row.holes) || 18,
      caddieTypeRef: row.caddie_type_ref ?? null,
      caddies: Number(row.caddies) || 0,
      quote: row.quote,
    }));
  },

  async addItem(club, cartId, item) {
    const id = randomUUID();
    await query(
      `INSERT INTO public.booking_cart_items
         (id, cart_id, club, course_ref, course_name, rate_ref, rate_name, image_url,
          scheduled_at, play_date, players, holes, caddie_type_ref, caddies, quote)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id, cartId, club,
        String(item.courseRef), item.courseName ?? String(item.courseRef),
        String(item.rateRef), item.rateName ?? 'Green fee',
        item.imageUrl ?? null,
        item.scheduledDateTime, item.scheduledDateTime.slice(0, 10),
        item.players, item.holes ?? 18, item.caddieTypeRef ?? null,
        item.caddies ?? 0, JSON.stringify(item.quote),
      ],
    );
    await this.touch(club, cartId);
    return id;
  },

  async updateItem(club, cartId, itemId, { players, caddies, caddieTypeRef, quote }) {
    const { rows } = await query(
      `UPDATE public.booking_cart_items
          SET players = COALESCE($4, players),
              caddies = COALESCE($5, caddies),
              caddie_type_ref = COALESCE($6, caddie_type_ref),
              quote = COALESCE($7, quote),
              updated_at = NOW()
        WHERE id = $3 AND cart_id = $1 AND club = $2
      RETURNING id`,
      [cartId, club, itemId, players ?? null, caddies ?? null, caddieTypeRef ?? null,
        quote ? JSON.stringify(quote) : null],
    );
    await this.touch(club, cartId);
    return rows[0]?.id ?? null;
  },

  async removeItem(club, cartId, itemId) {
    const { rowCount } = await query(
      `DELETE FROM public.booking_cart_items WHERE id = $3 AND cart_id = $1 AND club = $2`,
      [cartId, club, itemId],
    );
    await this.touch(club, cartId);
    return rowCount > 0;
  },

  async setGuest(club, cartId, guest) {
    await query(
      `UPDATE public.booking_carts SET guest = $3, updated_at = NOW()
        WHERE id = $1 AND club = $2`,
      [cartId, club, JSON.stringify(guest)],
    );
  },

  async clear(club, cartId) {
    await query(`DELETE FROM public.booking_cart_items WHERE cart_id = $1 AND club = $2`,
      [cartId, club]);
  },

  touch(club, cartId) {
    return query(`UPDATE public.booking_carts SET updated_at = NOW() WHERE id = $1 AND club = $2`,
      [cartId, club]);
  },
};

export const reservations = {
  async create(club, reservation) {
    const { rows } = await query(
      `INSERT INTO public.booking_reservations
         (club, confirmation_code, cart_id, guest, items, grand_total, deposit_amount,
          total_tax, currency, status, payment_status, payment_reference, cancellation_policy)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id, confirmation_code, created_at`,
      [
        club, reservation.confirmationCode, reservation.cartId,
        JSON.stringify(reservation.guest), JSON.stringify(reservation.items),
        reservation.grandTotal, reservation.depositAmount, reservation.totalTax,
        reservation.currency, reservation.status ?? 'Booked',
        reservation.paymentStatus ?? 'Deposit Paid', reservation.paymentReference ?? null,
        reservation.cancellationPolicy ?? null,
      ],
    );
    return rows[0];
  },

  async byCode(club, code) {
    const { rows } = await query(
      `SELECT * FROM public.booking_reservations WHERE club = $1 AND confirmation_code = $2`,
      [club, code],
    );
    return rows[0] ?? null;
  },

  async cancel(club, code, refundAmount) {
    const { rows } = await query(
      `UPDATE public.booking_reservations
          SET status = 'Cancelled', refund_amount = $3, cancelled_at = NOW(), updated_at = NOW()
        WHERE club = $1 AND confirmation_code = $2 AND status <> 'Cancelled'
      RETURNING *`,
      [club, code, refundAmount],
    );
    return rows[0] ?? null;
  },
};
