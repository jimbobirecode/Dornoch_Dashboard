/**
 * The public booking API.
 *
 * Unlike `api.js` this is not a signed-in surface: a visitor books before the
 * club knows who they are. The basket is identified by a cookie the server
 * sets, so every call sends credentials even though nobody is logged in.
 */
const BASE = '/api/book';

export class BookingApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'BookingApiError';
    this.status = status;
    this.code = code;
    /** For a failed checkout this is `{ field: message }`, ready for the form. */
    this.details = details ?? null;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new BookingApiError('Could not reach the booking system. Check your connection.', {
      status: 0,
    });
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new BookingApiError(payload?.error ?? `Request failed (${response.status})`, {
      status: response.status,
      code: payload?.code,
      details: payload?.details,
    });
  }
  return payload;
}

function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const bookingApi = {
  config: (club) => request(`/config${queryString({ club })}`),

  availability: ({ date, players, timeRange, club }) =>
    request(`/availability${queryString({ date, players, timeRange, club })}`),

  cart: (club) => request(`/cart${queryString({ club })}`),

  addToCart: (line, club) =>
    request(`/cart/items${queryString({ club })}`, { method: 'POST', body: line }),

  updateCartItem: (itemId, patch, club) =>
    request(`/cart/items/${itemId}${queryString({ club })}`, { method: 'PATCH', body: patch }),

  removeCartItem: (itemId, club) =>
    request(`/cart/items/${itemId}${queryString({ club })}`, { method: 'DELETE' }),

  paymentSession: (club) => request(`/payment-session${queryString({ club })}`),

  checkout: (payload, club) =>
    request(`/checkout${queryString({ club })}`, { method: 'POST', body: payload }),

  refundQuote: (code, club) => request(`/reservations/${code}/refund-quote${queryString({ club })}`),

  cancel: (code, club) =>
    request(`/reservations/${code}/cancel${queryString({ club })}`, { method: 'POST' }),
};
