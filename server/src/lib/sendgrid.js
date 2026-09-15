/**
 * The slice of the SendGrid v3 mail API this dashboard uses: one dynamic
 * template, one recipient, no attachments.
 *
 * It is a plain `fetch` rather than the official SDK — that is one dependency
 * for a single POST, and Node 20 (the floor in `package.json`) has fetch built
 * in.
 */
const ENDPOINT = 'https://api.sendgrid.com/v3/mail/send';
const TIMEOUT_MS = 15_000;

/**
 * Send one templated email.
 *
 * Resolves to `{ ok, status, message }` rather than throwing: a campaign run
 * sends to many guests, and one bad address must not abandon the rest.
 */
export async function sendTemplateEmail({
  apiKey,
  fromEmail,
  fromName,
  toEmail,
  templateId,
  data,
  fetchImpl = fetch,
}) {
  const body = {
    from: { email: fromEmail, name: fromName },
    personalizations: [{ to: [{ email: toEmail }], dynamic_template_data: data }],
    template_id: templateId,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.status === 200 || response.status === 202) {
      return { ok: true, status: response.status, message: `Sent to ${toEmail}` };
    }

    return {
      ok: false,
      status: response.status,
      message: `SendGrid error ${response.status}: ${await describeFailure(response)}`,
    };
  } catch (err) {
    const message = err?.name === 'AbortError' ? 'SendGrid timed out' : err.message;
    return { ok: false, status: 0, message };
  } finally {
    clearTimeout(timer);
  }
}

/** SendGrid reports the real problem (bad template id, unverified sender) in the body. */
async function describeFailure(response) {
  try {
    const payload = await response.json();
    const errors = payload?.errors;
    if (Array.isArray(errors) && errors.length) {
      return errors.map((error) => error.message).filter(Boolean).join('; ');
    }
  } catch {
    /* falls through to the generic wording */
  }
  return 'request rejected';
}
