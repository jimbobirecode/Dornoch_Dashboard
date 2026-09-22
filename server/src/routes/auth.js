/**
 * Sign-in, the forced first password change, and self-service reset.
 *
 * The reset half is deliberately dull to talk to: every "I forgot my password"
 * request gets the same answer whether or not the account exists, and the
 * token in the email is only ever compared by its hash. The rules live in
 * lib/password-reset-domain.js; this file stores, sends and nothing else.
 */
import { Router } from 'express';
import { query } from '../db.js';
import {
  authenticateUser,
  clearSession,
  issueSession,
  requireAuth,
  setPermanentPassword,
  updateLastLogin,
} from '../auth.js';
import { clubDisplayName } from '../lib/bookings-domain.js';
import { getUserColumns, hasPasswordReset } from '../lib/schema.js';
import {
  NEUTRAL_REPLY,
  buildResetTemplateData,
  createThrottle,
  hashToken,
  maskAddress,
  mintToken,
  publicResetConfig,
  readResetConfig,
  resetLink,
  resetRowUsable,
  resolveResetEmail,
  validatePassword,
} from '../lib/password-reset-domain.js';
import { sendTemplateEmail } from '../lib/sendgrid.js';

const router = Router();

/**
 * Two throttles, both unauthenticated surfaces. The first stops one account
 * being mailed a link over and over; the second stops a client working through
 * tokens. Neither survives a restart — see the note in the domain module.
 */
const requestThrottle = createThrottle({ limit: 5, windowMs: 15 * 60_000 });
const redeemThrottle = createThrottle({ limit: 20, windowMs: 15 * 60_000 });

router.post('/login', async (req, res, next) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await authenticateUser(username, password);
    if (!result) return res.status(401).json({ error: 'Invalid username or password' });

    const { user, mustChangePassword } = result;
    issueSession(res, user);
    if (!mustChangePassword) await updateLastLogin(user.id);

    res.json({ user: publicUser(user), mustChangePassword });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  const { newPassword } = req.body ?? {};
  const valid = validatePassword(newPassword);
  if (!valid.ok) return res.status(400).json({ error: valid.reason });

  try {
    await setPermanentPassword(Number(req.user.sub), newPassword);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: Number(req.user.sub),
      username: req.user.username,
      fullName: req.user.fullName,
      customerId: req.user.customerId,
      clubName: clubDisplayName(req.user.customerId),
      role: req.user.role ?? 'admin',
    },
  });
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

/**
 * What the login screen needs to know before it offers a "forgot password"
 * link: whether the migration has been run and whether SendGrid is configured.
 * Unauthenticated by necessity, so it carries no key and no address.
 */
router.get('/reset-config', async (req, res) => {
  let migrated = false;
  try {
    migrated = await hasPasswordReset();
  } catch {
    // A database that cannot be reached is reported as "not available" rather
    // than as an error; the login form itself still works.
  }
  res.json(publicResetConfig(readResetConfig(), { migrated }));
});

/**
 * Start a reset. The reply is the same sentence in every case — unknown
 * account, no address on file, throttled, or link genuinely sent — so this
 * endpoint cannot be used to enumerate usernames.
 */
router.post('/forgot-password', async (req, res) => {
  const identifier = String(req.body?.username ?? '').trim();
  if (!identifier) return res.status(400).json({ error: 'Enter your username or email address' });

  res.json({ ok: true, message: NEUTRAL_REPLY });

  // Everything past here is best-effort and must never change the answer
  // above, so failures are logged rather than surfaced.
  try {
    if (!requestThrottle.check(`${identifier}|${clientIp(req)}`)) {
      console.warn('[auth] password reset throttled for', identifier);
      return;
    }
    if (!(await hasPasswordReset())) {
      console.warn('[auth] password reset requested but migration_add_password_reset.sql has not been run');
      return;
    }

    const config = readResetConfig();
    if (!config.configured) {
      console.warn('[auth] password reset requested but not configured:', config.missing.join(', '));
      return;
    }

    const user = await findUserForReset(identifier);
    if (!user) return;

    const address = resolveResetEmail(user);
    if (!address) {
      console.warn('[auth] no email address on file for', user.username);
      return;
    }

    const { token, tokenHash, expiresAt } = mintToken({ ttlMinutes: config.ttlMinutes });

    // A new link supersedes any outstanding one, so a stolen older email stops
    // working the moment the real user asks again.
    await query(
      'UPDATE public.password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [user.id],
    );
    await query(
      `INSERT INTO public.password_resets (user_id, token_hash, email, expires_at, requested_ip)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, tokenHash, address, expiresAt, clientIp(req)],
    );

    const result = await sendTemplateEmail({
      apiKey: config.apiKey,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      toEmail: address,
      templateId: config.templateId,
      data: buildResetTemplateData({
        user,
        link: resetLink(config.appUrl, token),
        ttlMinutes: config.ttlMinutes,
        clubName: clubDisplayName(user.customer_id),
        fromEmail: config.fromEmail,
      }),
    });

    if (!result.ok) console.error('[auth] reset email failed:', result.message);
  } catch (err) {
    console.error('[auth] password reset failed:', err.message);
  }
});

/**
 * Whether a link is still good, asked before the new-password form is drawn.
 * The token travels in the body rather than the path so it stays out of access
 * logs and browser history.
 */
router.post('/reset-password/check', async (req, res, next) => {
  try {
    const found = await findResetRow(req.body?.token);
    if (!found.ok) return res.status(400).json({ error: found.reason });
    res.json({
      ok: true,
      email: maskAddress(found.row.email),
      username: found.row.username,
      // 'invite' means this account has never had a password, so the page
      // says "set" rather than "reset" and does not imply they forgot one.
      purpose: found.row.purpose ?? 'reset',
      fullName: found.row.full_name ?? '',
      clubName: clubDisplayName(found.row.customer_id),
    });
  } catch (err) {
    next(err);
  }
});

/** Redeem a link: set the password, burn the token, sign nobody in. */
router.post('/reset-password', async (req, res, next) => {
  const { token, newPassword, confirmPassword } = req.body ?? {};

  const valid = validatePassword(newPassword, confirmPassword);
  if (!valid.ok) return res.status(400).json({ error: valid.reason });

  try {
    if (!redeemThrottle.check(clientIp(req))) {
      return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    }

    const found = await findResetRow(token);
    if (!found.ok) return res.status(400).json({ error: found.reason });

    await setPermanentPassword(found.row.user_id, newPassword);
    // Every outstanding link for this user dies with the one just used.
    await query(
      'UPDATE public.password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [found.row.user_id],
    );

    // The new password is proved by signing in with it, so no session is
    // issued here — a reset link should never be a way in by itself.
    clearSession(res);
    res.json({
      ok: true,
      username: found.row.username,
      purpose: found.row.purpose ?? 'reset',
    });
  } catch (err) {
    next(err);
  }
});

/** By username or by the address on file; both are unique enough in practice. */
async function findUserForReset(identifier) {
  const columns = await getUserColumns();
  const byEmail = columns.has('email') ? ' OR LOWER(email) = LOWER($1)' : '';

  const { rows } = await query(
    `SELECT ${columns.selectList} FROM public.dashboard_users
      WHERE LOWER(username) = LOWER($1)${byEmail}
      ORDER BY id LIMIT 1`,
    [identifier],
  );

  const user = rows[0];
  if (!user) return null;
  if (columns.has('is_active') && !user.is_active) return null;
  return user;
}

/** The reset row a token names, with the usability rules already applied. */
async function findResetRow(token) {
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'This reset link is not valid. Request a new one.' };
  }
  if (!(await hasPasswordReset())) {
    return { ok: false, reason: 'Password reset is not available on this install.' };
  }

  const { rows } = await query(
    `SELECT r.*, u.username, u.full_name, u.customer_id, u.is_active
       FROM public.password_resets r
       JOIN public.dashboard_users u ON u.id = r.user_id
      WHERE r.token_hash = $1`,
    [hashToken(token)],
  );

  // A deactivated account's outstanding link must not be a way back in.
  if (rows[0] && rows[0].is_active === false) {
    return { ok: false, reason: 'This account is no longer active. Ask an administrator.' };
  }

  const usable = resetRowUsable(rows[0]);
  return usable.ok ? { ok: true, row: rows[0] } : usable;
}

/** Behind a proxy the socket address is the proxy's, so trust the header. */
function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    customerId: user.customer_id,
    clubName: clubDisplayName(user.customer_id),
    role: user.role ?? 'admin',
  };
}

export default router;
