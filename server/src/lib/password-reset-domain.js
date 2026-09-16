/**
 * Self-service password reset: the rules, none of the plumbing.
 *
 * Pure functions over plain values, so every decision that matters — who a
 * link may be sent to, how long it lives, what counts as a usable password,
 * and what the browser is allowed to be told — is unit-tested without a
 * database or an API key. `routes/auth.js` does the storing and the sending.
 *
 * Two rules run through all of it:
 *
 *  1. The response to "I forgot my password" never reveals whether the account
 *     exists. Anyone can hit that endpoint, and a distinguishable answer turns
 *     it into a list of every valid username.
 *  2. The token is a secret the database never holds. Only its SHA-256 is
 *     stored, so a leaked table cannot be replayed into an account takeover.
 */
import crypto from 'node:crypto';
import { BRAND } from './brand.js';

/** How long an emailed link stays usable, unless the environment says otherwise. */
export const DEFAULT_TTL_MINUTES = 60;

/** The shortest password the dashboard accepts, matching the change-password screen. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * What a reset request is told, whatever actually happened. The wording is
 * deliberately the same for an unknown username, a known one with no address
 * on file and a link that really went out.
 */
export const NEUTRAL_REPLY =
  'If that account exists and has an email address on file, a reset link is on its way.';

/** Reset email settings, with the SendGrid key reduced to a yes/no. */
export function readResetConfig(env = process.env) {
  const missing = [];
  if (!env.SENDGRID_API_KEY) missing.push('SENDGRID_API_KEY');
  if (!env.FROM_EMAIL) missing.push('FROM_EMAIL');
  if (!env.SENDGRID_TEMPLATE_PASSWORD_RESET) missing.push('SENDGRID_TEMPLATE_PASSWORD_RESET');
  // Without a public URL the emailed link would be a relative path and useless,
  // so it counts as missing configuration rather than something to guess at.
  if (!env.APP_URL && !env.PUBLIC_URL) missing.push('APP_URL');
  const complete = missing;

  return {
    hasApiKey: Boolean(env.SENDGRID_API_KEY),
    apiKey: env.SENDGRID_API_KEY ?? null,
    fromEmail: env.FROM_EMAIL ?? null,
    fromName: env.FROM_NAME ?? BRAND.fromName,
    templateId: env.SENDGRID_TEMPLATE_PASSWORD_RESET ?? null,
    // Where the link points. Without it the email would carry a relative path
    // and be useless, so it is required rather than guessed.
    appUrl: trimSlash(env.APP_URL ?? env.PUBLIC_URL ?? ''),
    ttlMinutes: positiveInt(env.PASSWORD_RESET_TTL_MINUTES, DEFAULT_TTL_MINUTES),
    missing: complete,
    configured: complete.length === 0,
  };
}

/** Strips the API key, for anything that crosses the wire. */
export function publicResetConfig(config, { migrated = true } = {}) {
  const { apiKey, ...rest } = config;
  return {
    ...rest,
    migrated,
    // The login screen only offers the link when a click could actually
    // produce an email; otherwise it says what an administrator has to do.
    available: migrated && config.missing.length === 0,
  };
}

/**
 * A fresh token and the row that will remember it.
 *
 * 32 bytes of CSPRNG is well past guessing range, and base64url survives being
 * pasted out of an email client without escaping.
 */
export function mintToken({ ttlMinutes = DEFAULT_TTL_MINUTES, now = new Date() } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
  };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** The link the email carries. */
export function resetLink(appUrl, token) {
  return `${trimSlash(appUrl)}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Where a reset link for this account should go.
 *
 * The `email` column is the answer where an install has run the migration and
 * filled it in. Failing that, a username that is itself an address is a
 * perfectly good one — that is how most of these accounts are actually named.
 * Anything else has nowhere to send to, which is not an error the requester is
 * told about.
 */
export function resolveResetEmail(user) {
  const stored = cleanAddress(user?.email);
  if (stored) return stored;

  const username = cleanAddress(user?.username);
  return username ?? null;
}

/** A plausible address, lowercased and trimmed, or null. */
export function cleanAddress(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : null;
}

/**
 * `j***@example.com` — enough for the reader to recognise their own address
 * without the page disclosing one they do not already know.
 */
export function maskAddress(address) {
  const clean = cleanAddress(address);
  if (!clean) return null;

  const [local, domain] = clean.split('@');
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

/** The dynamic-template data the reset email is rendered from. */
export function buildResetTemplateData({ user, link, ttlMinutes, clubName, fromEmail }) {
  return {
    subject: `Reset your ${clubName ?? BRAND.fullName} dashboard password`,
    first_name: firstName(user),
    full_name: user?.full_name ?? user?.fullName ?? user?.username ?? '',
    username: user?.username ?? '',
    club_name: clubName ?? BRAND.fullName,
    reset_url: link,
    // Both spellings: dynamic templates in the wild use either.
    reset_link: link,
    expires_in_minutes: ttlMinutes,
    expires_in: ttlMinutes >= 60 && ttlMinutes % 60 === 0
      ? `${ttlMinutes / 60} hour${ttlMinutes === 60 ? '' : 's'}`
      : `${ttlMinutes} minutes`,
    support_email: fromEmail ?? null,
  };
}

/**
 * Whether a stored reset row may still be redeemed. Kept here so the route
 * cannot accidentally accept a used or expired one by forgetting a clause.
 */
export function resetRowUsable(row, now = new Date()) {
  if (!row) return { ok: false, reason: 'This reset link is not valid. Request a new one.' };
  if (row.used_at) return { ok: false, reason: 'This reset link has already been used. Request a new one.' };
  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    return { ok: false, reason: 'This reset link has expired. Request a new one.' };
  }
  return { ok: true };
}

/** The same rule the change-password screen enforces, in one place. */
export function validatePassword(password, confirm) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (confirm !== undefined && password !== confirm) {
    return { ok: false, reason: 'Passwords do not match' };
  }
  return { ok: true };
}

/**
 * A crude per-key throttle, in memory.
 *
 * It exists so one script cannot mail a user hundreds of links, not to survive
 * a restart or to coordinate across instances — a real rate limiter belongs in
 * front of the app. Keys are dropped as they expire, so the map does not grow
 * without bound.
 */
export function createThrottle({ limit = 5, windowMs = 15 * 60_000 } = {}) {
  const hits = new Map();

  return {
    /** True when this key may proceed; the call itself counts as an attempt. */
    check(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
      recent.push(now);
      hits.set(key, recent);

      for (const [other, times] of hits) {
        if (!times.some((time) => now - time < windowMs)) hits.delete(other);
      }
      return recent.length <= limit;
    },
    reset() {
      hits.clear();
    },
  };
}

function firstName(user) {
  const full = String(user?.full_name ?? user?.fullName ?? '').trim();
  if (full) return full.split(/\s+/)[0];
  return String(user?.username ?? '').split('@')[0];
}

function trimSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
