/**
 * The Agilysys Web Booking Engine, as a provider.
 *
 * Cabot Highlands books through this service, and the translation below was
 * built from a capture of its live traffic (see BOOKING_ENGINE.md for the
 * endpoint-by-endpoint mapping). The wire format is idiosyncratic in ways worth
 * naming, because the translation exists to absorb them:
 *
 *   - A "rate type" is two ids. `rateTypeId` is the tariff (457 visitor, 490
 *     member/resident) and `id` is that tariff priced for one course, so the
 *     same tariff carries a different `id` on each course and on each date.
 *   - `teeTimeId` is 0 for a slot that has never been booked. It is not a key.
 *   - Prices are per player; the party multiplies them.
 *   - A failure is a 200 with `success: false`, so the status code cannot be
 *     trusted on its own.
 *
 * The exported `map*` functions are pure and carry the translation; `client`
 * wraps them in fetches.
 */

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * One Agilysys rate type in the engine's own vocabulary.
 *
 * `rateRef` is the pair that actually identifies the rate when placing a
 * booking; either half alone is ambiguous.
 */
export function mapRateType(rate, { taxPercent = 0, depositPercent = 100 } = {}) {
  return {
    rateRef: String(rate.id),
    tariffRef: rate.rateTypeId === undefined ? null : String(rate.rateTypeId),
    playerTypeRef: rate.playerTypeId === undefined ? null : String(rate.playerTypeId),
    name: rate.name ?? 'Green fee',
    holeType: Number(rate.holeType) || 18,
    isPrivate: rate.isPrivate === true,
    minimumPlayers: Number(rate.minimumPlayers) || 0,
    guaranteeType: rate.guaranteeType ?? 'None',
    rates: {
      greenFee: money(rate.rates?.greenFee),
      cartFee: money(rate.rates?.cartFee),
      otherFee: money(rate.rates?.otherFee),
    },
    // The WBE prices VAT-inclusive and takes the full amount as deposit; both
    // are properties of the club's configuration, not of the wire format.
    taxPercent,
    depositPercent,
  };
}

export function mapSlot(slot, options) {
  return {
    scheduledDateTime: slot.scheduledDateTime,
    availableCount: Number(slot.availableCount) || 0,
    holeNumber: String(slot.holeNumber ?? '1'),
    // 0 means "not yet allocated", which is not an identifier — keep it as null
    // so nothing downstream tries to look a slot up by it.
    teeTimeRef: slot.teeTimeId ? String(slot.teeTimeId) : null,
    allocationCode: slot.allocationBlockCode ?? 'ALL',
    allocationName: slot.allocationBlockName ?? 'ALL',
    rateTypes: (slot.rateTypes ?? []).map((rate) => mapRateType(rate, options)),
  };
}

/** A `multiCourse` response as the engine's course-and-slots shape. */
export function mapMultiCourse(payload, options) {
  if (!payload?.success) throw agilysysError(payload, 'availability');

  return (payload.result ?? [])
    .map((course) => ({
      courseRef: String(course.courseId),
      name: course.courseName,
      requestOnly: course.resvReqd === true,
      listOrder: Number(course.listOrder) || 0,
      slots: (course.slots ?? []).map((slot) => mapSlot(slot, options)),
    }))
    .sort((a, b) => a.listOrder - b.listOrder || a.name.localeCompare(b.name));
}

/** The body `multiCourse` wants for a date range. */
export function buildMultiCourseRequest({ fromDate, toDate, withBasePrice = true }) {
  return { fromDate, toDate: toDate ?? fromDate, withBasePrice };
}

/**
 * The body `getPrice` wants. It re-quotes a slot at the moment of adding it to
 * the cart, and is also how availability is confirmed — a slot someone else has
 * taken comes back `isAvailable: false` rather than as an error.
 */
export function buildPriceRequest(lines) {
  return {
    cartDetails: lines.map((line) => ({
      courseId: Number(line.courseRef),
      dateTime: line.scheduledDateTime,
      holes: String(line.holes ?? 18),
      rateTypeId: [Number(line.rateRef)],
    })),
  };
}

export function mapPriceResponse(payload) {
  if (!payload?.success) throw agilysysError(payload, 'pricing');

  return (payload.cartDetails ?? []).map((detail) => {
    const rate = detail.rate?.[0] ?? {};
    return {
      courseRef: String(detail.courseId),
      scheduledDateTime: detail.dateTime,
      available: detail.isAvailable === true,
      availableSlots: Number(detail.availableSlots) || 0,
      rateRef: rate.rateTypeId === undefined ? null : String(rate.rateTypeId),
      quote: {
        greenFee: money(rate.greenFee),
        cartFee: money(rate.cartFee),
        otherFee: money(rate.otherFee),
        greenFeeTax: money(rate.greenFeeTax),
        cartFeeTax: money(rate.cartFeeTax),
        otherFeeTax: money(rate.otherFeeTax),
        totalPrice: money(rate.totalPrice),
        totalTax: money(rate.totalTax),
        depositAmount: money(rate.depositAmount),
        totalDiscount: money(rate.totalDiscount),
      },
    };
  });
}

/** `propertyInfo` as the fields `property-config.js` holds. */
export function mapPropertyInfo(payload) {
  if (!payload?.success) throw agilysysError(payload, 'property info');

  const config = payload.rBookConfig ?? {};
  const info = payload.golfPropertyInfo ?? {};

  return {
    propertyName: info.propertyName ?? payload.golfPropertySettings?.propertyName ?? null,
    timeZone: payload.golfHeader?.timeZone ?? null,
    /** The club's own today, which is not necessarily the server's. */
    propertyDate: (payload.golfHeader?.propertyDTTM ?? '').slice(0, 10) || null,
    address: [info.address1, info.city, info.zip, info.country].filter(Boolean).join(', '),

    firstNameRequired: config.firstNameRequired === true,
    lastNameRequired: config.lastNameRequired === true,
    emailRequired: config.emailRequired === true,
    phoneRequired: config.phoneRequired === true,
    pincodeRequired: config.pincodeRequired === true,
    genderRequired: config.genderRequired === true,
    titleRequired: config.titleRequired === true,
    birthdayRequired: config.birthdayRequired === true,
    addressRequired: config.addressRequired === true,
    cityRequired: config.cityRequired === true,
    stateRequired: config.stateRequired === true,
    countryRequired: config.countryRequired === true,
    noOfHolesRequired: config.noOfHolesRequired === true,

    creditCardRequired: config.creditCardRequired === true,
    requireTeeTimesDeposit: config.requireTeeTimesDeposit === true,
    allowTeeTimesEdit: config.allowTeeTimesEdit === true,
    allowTeeTimesCancel: config.allowTeeTimesCancel === true,
    bookingDaysOut: Number(config.bookingDaysOut) || 0,
    cancelDaysOut: Number(config.cancelDaysOut) || 0,
    cancellationPolicy: config.cancellationPolicy ?? '',
    depositPolicy: config.depositPolicy ?? '',
  };
}

/** `caddyTypeByLocale`, keeping only the types the club has switched on. */
export function mapCaddieTypes(payload) {
  if (!payload?.success) return [];

  return (payload.caddyTypeConfig?.caddyTypeDetails ?? [])
    .filter((caddie) => caddie.isActive === true && caddie.isEnabled === true)
    .map((caddie) => ({
      caddieRef: String(caddie.id),
      name: caddie.type,
      bagValue: Number(caddie.bagValue) || 1,
      fee: money(caddie.fee),
    }));
}

/**
 * The WBE reports failures as a 200 carrying `success: false`, sometimes with
 * a `Message`, sometimes an `errorMessage`, and capitalises `Success`
 * inconsistently between services. Normalising that here keeps every caller
 * from having to know it.
 */
export function agilysysError(payload, what) {
  const message =
    payload?.Message ??
    payload?.ErrorMessage ??
    payload?.errorMessage ??
    `The booking engine did not return ${what}.`;

  const error = new Error(message);
  error.name = 'AgilysysError';
  error.code = payload?.ErrorCode ?? null;
  error.correlationId = payload?.wbeCorrelationId ?? null;
  return error;
}

export function isSuccess(payload) {
  return payload?.success === true || payload?.Success === true;
}

/**
 * A live client. Every path carries the tenant and property, and a token is
 * fetched once and reused until it is close to expiring — the WBE issues a JWT
 * good for an hour.
 */
export function client(settings, { fetchImpl = globalThis.fetch } = {}) {
  const { baseUrl, tenantId, propertyId, appName = 'golf' } = settings;
  const scope = `tenants/${tenantId}/propertyId/${propertyId}`;
  let token = null;

  async function call(path, { method = 'GET', body, query } = {}) {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    const response = await fetchImpl(url, {
      method,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-GB,en;q=0.9',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw agilysysError(payload, `a response from ${path} (HTTP ${response.status})`);
    }
    return payload;
  }

  return {
    async authenticate() {
      const payload = await call(
        `/wbe-admin-service/generatetoken/v2/tenants/${tenantId}/propertyId/${propertyId}/appName/NA`,
      );
      if (!isSuccess(payload)) throw agilysysError(payload, 'a token');
      token = payload.token;
      return token;
    },

    async propertyInfo() {
      return mapPropertyInfo(
        await call(`/wbe-golf-service/golf/${scope}/propertyInfo`, { query: { appName } }),
      );
    },

    async availability({ fromDate, toDate, ...options }) {
      return mapMultiCourse(
        await call(`/wbe-golf-service/golf/${scope}/multiCourse`, {
          method: 'POST',
          body: buildMultiCourseRequest({ fromDate, toDate }),
        }),
        options,
      );
    },

    async price(lines) {
      return mapPriceResponse(
        await call(`/wbe-golf-service/golf/${scope}/getPrice`, {
          method: 'PUT',
          query: { appName },
          body: buildPriceRequest(lines),
        }),
      );
    },

    async caddieTypes(locale = 'EN') {
      return mapCaddieTypes(
        await call(`/wbe-golf-service/caddyTypeConfig/${scope}/caddyTypeByLocale`, {
          query: { locale },
        }),
      );
    },

    /**
     * The hosted payment iframe. The WBE never lets card details reach its own
     * origin, and neither does this — the browser posts them straight to the
     * gateway and the engine only ever sees the resulting token.
     */
    async payToken() {
      const payload = await call(`/wbe-reservation-service/reservation/tenants/${tenantId}/payToken`, {
        query: { propertyId },
      });
      if (!isSuccess(payload)) throw agilysysError(payload, 'a payment token');

      return {
        iframeUrl: payload.iframeUrl,
        gatewayId: payload.gatewayId,
        clientId: payload.clientID,
        stylesUrl: payload.paymentStylesUrl ?? null,
      };
    },
  };
}
