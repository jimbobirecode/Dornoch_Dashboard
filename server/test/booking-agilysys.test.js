/**
 * The Agilysys translation, checked against a capture of Cabot Highlands'
 * live booking engine (`fixtures/agilysys-cabot.json`).
 *
 * These are the payloads the real service returned, trimmed to a few slots per
 * course and with the payment tokens scrubbed. Testing the mapping against them
 * is the only way to know the translation matches the service rather than
 * matching our idea of it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  agilysysError,
  buildMultiCourseRequest,
  buildPriceRequest,
  client,
  isSuccess,
  mapCaddieTypes,
  mapMultiCourse,
  mapPriceResponse,
  mapPropertyInfo,
  mapRateType,
} from '../src/lib/booking/providers/agilysys.js';
import { basePrice, bookableSlots, quoteLine } from '../src/lib/booking/engine-domain.js';

const CABOT = JSON.parse(
  readFileSync(new URL('./fixtures/agilysys-cabot.json', import.meta.url), 'utf8'),
);

test('the live tee sheet maps to courses and slots', () => {
  const courses = mapMultiCourse(CABOT.multiCourse);

  // Old Petty sorts first because its listOrder is 0 against Castle Stuart's 40.
  assert.deepEqual(courses.map((course) => course.name), ['OLD PETTY', 'CASTLE STUART']);
  assert.deepEqual(courses.map((course) => course.courseRef), ['40', '39']);
  assert.ok(courses.every((course) => course.requestOnly === false));
  assert.ok(courses.every((course) => course.slots.length > 0));
});

test('a slot keeps its time, its places and its rates', () => {
  const castle = mapMultiCourse(CABOT.multiCourse).find((c) => c.courseRef === '39');
  const first = castle.slots[0];

  assert.equal(first.scheduledDateTime, '2026-09-25T08:00:00');
  assert.equal(first.availableCount, 2);
  assert.equal(first.holeNumber, '1');
  assert.equal(first.allocationCode, 'ALL');
  assert.equal(first.rateTypes.length, 2);
});

test('a teeTimeId of 0 is not treated as an identifier', () => {
  const castle = mapMultiCourse(CABOT.multiCourse).find((c) => c.courseRef === '39');

  // The live sheet returns 78327 for the 08:00 and 0 for the 08:12, which means
  // "never booked", not "slot zero".
  assert.equal(castle.slots[0].teeTimeRef, '78327');
  assert.equal(castle.slots[1].teeTimeRef, null);
});

test('a rate carries both of the ids needed to book it', () => {
  const castle = mapMultiCourse(CABOT.multiCourse).find((c) => c.courseRef === '39');
  const [visitor, member] = castle.slots[0].rateTypes;

  assert.equal(visitor.name, 'Visitor Online Booking');
  assert.equal(visitor.rateRef, '194038', 'the course-and-date priced id');
  assert.equal(visitor.tariffRef, '457', 'the tariff it belongs to');
  assert.equal(visitor.playerTypeRef, '70');
  assert.equal(visitor.rates.greenFee, 385);

  assert.equal(member.name, 'Scottish Golf Member/Resident Online');
  assert.equal(member.rateRef, '242994');
  assert.equal(member.tariffRef, '490');
  assert.equal(member.rates.greenFee, 170);
});

test('the same tariff is a different rate id on each course', () => {
  const courses = mapMultiCourse(CABOT.multiCourse);
  const visitorOn = (ref) =>
    courses.find((c) => c.courseRef === ref).slots[0].rateTypes.find((r) => r.tariffRef === '457');

  // This is the trap the translation exists to absorb: booking Old Petty with
  // Castle Stuart's rate id would be rejected, though both are "tariff 457".
  assert.equal(visitorOn('39').rateRef, '194038');
  assert.equal(visitorOn('40').rateRef, '194223');
  assert.notEqual(visitorOn('39').rateRef, visitorOn('40').rateRef);
  assert.equal(visitorOn('39').tariffRef, visitorOn('40').tariffRef);
});

test('mapped rates price correctly through the shared domain', () => {
  const castle = mapMultiCourse(CABOT.multiCourse).find((c) => c.courseRef === '39');
  const visitor = castle.slots[0].rateTypes[0];

  // £385 a head, four players, VAT-inclusive — the figure the live cart showed.
  assert.equal(quoteLine({ rate: visitor, players: 4 }).grandTotal, 1540);
  assert.equal(basePrice(castle.slots[0]), 170, 'the member rate is the cheaper');
});

test('a four-ball only sees slots with four places', () => {
  const castle = mapMultiCourse(CABOT.multiCourse).find((c) => c.courseRef === '39');

  // The capture's first three slots have 2, 4 and 2 places.
  assert.deepEqual(
    bookableSlots(castle.slots, 4).map((slot) => slot.scheduledDateTime),
    ['2026-09-25T08:12:00'],
  );
  assert.equal(bookableSlots(castle.slots, 2).length, 3);
});

test('the club config is read out of propertyInfo', () => {
  const info = mapPropertyInfo(CABOT.propertyInfo);

  assert.equal(info.propertyName, 'Cabot Highlands');
  assert.equal(info.timeZone, 'Europe/London');
  assert.equal(info.propertyDate, '2026-09-21', "the club's own today");
  assert.equal(info.bookingDaysOut, 591);
  assert.equal(info.firstNameRequired, true);
  assert.equal(info.pincodeRequired, true);
  assert.equal(info.countryRequired, false);
  assert.equal(info.creditCardRequired, true);
  assert.equal(info.requireTeeTimesDeposit, true);
  assert.equal(info.allowTeeTimesCancel, false, 'Cabot does not cancel online');
  assert.match(info.cancellationPolicy, /more than 8 weeks/);
  assert.match(info.depositPolicy, /caddie fees are not included/);
  assert.match(info.address, /Inverness/);
});

test('the price request carries the pair of ids and the hole count', () => {
  const body = buildPriceRequest([
    { courseRef: '39', scheduledDateTime: '2026-09-25T08:12:00', holes: 18, rateRef: '194038' },
  ]);

  // Byte-for-byte the body the live engine was sent.
  assert.deepEqual(body, {
    cartDetails: [
      { courseId: 39, dateTime: '2026-09-25T08:12:00', holes: '18', rateTypeId: [194038] },
    ],
  });
});

test('the availability request defaults to a single day', () => {
  assert.deepEqual(buildMultiCourseRequest({ fromDate: '2026-09-25' }), {
    fromDate: '2026-09-25',
    toDate: '2026-09-25',
    withBasePrice: true,
  });
});

test('a re-quote reports the price and whether the slot survived', () => {
  const [quote] = mapPriceResponse(CABOT.getPrice);

  assert.equal(quote.courseRef, '39');
  assert.equal(quote.scheduledDateTime, '2026-09-25T08:12:00');
  assert.equal(quote.quote.totalPrice, 385);
  assert.equal(quote.quote.depositAmount, 385);
  assert.equal(quote.quote.totalTax, 0, 'fees are VAT-inclusive at Cabot');

  // The captured re-quote came back unavailable — this is exactly the case a
  // cart has to survive rather than treat as a failure.
  assert.equal(quote.available, false);
  assert.equal(quote.availableSlots, 0);
});

test('only the caddie types the club has switched on are offered', () => {
  const caddies = mapCaddieTypes(CABOT.caddyTypes);

  assert.deepEqual(caddies.map((caddie) => caddie.name), ['Forecaddie', 'Single Bag']);
  assert.ok(caddies.every((caddie) => caddie.bagValue >= 1));
  // Forecaddie 2/3/4 and Buggy Caddie are configured but inactive.
  assert.equal(caddies.length, 2);
});

test('a config the club has never filled in is no caddies, not a crash', () => {
  assert.deepEqual(mapCaddieTypes(CABOT.cartTypesEmpty), []);
  assert.deepEqual(mapCaddieTypes(null), []);
});

test('a failure arrives as a 200 and is still a failure', () => {
  // The live getCancellationPolicy call answered 200 with success:false.
  assert.equal(isSuccess(CABOT.cancellationPolicyError), false);

  const error = agilysysError(CABOT.cancellationPolicyError, 'a policy');
  assert.equal(error.message, 'Error while connecting to Cloud PMS');
  assert.equal(error.code, 'CLOUD_CON_ERROR');
  assert.equal(error.correlationId, '75577c48-1c62-48c3-a5a9-1b76e0db8083');
});

test('the services disagree about capitalising success', () => {
  // golf-service sends `success`, property-service sends `Success`.
  assert.equal(isSuccess({ success: true }), true);
  assert.equal(isSuccess(CABOT.timeInterval), true, 'Success, capitalised');
  assert.equal(isSuccess({}), false);
});

test('mapping a failed payload throws rather than returning nothing', () => {
  assert.throws(() => mapMultiCourse({ success: false, errorMessage: 'no' }), /no/);
  assert.throws(() => mapPropertyInfo({ success: false }), /property info/);
});

test('a rate with no fees at all prices as free rather than NaN', () => {
  const rate = mapRateType({ id: 1, name: 'Comp', rates: {} });
  assert.deepEqual(rate.rates, { greenFee: 0, cartFee: 0, otherFee: 0 });
  assert.equal(quoteLine({ rate, players: 4 }).grandTotal, 0);
});

test('the client sends the tenant, the property and the mapped body', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, json: async () => CABOT.multiCourse };
  };

  const wbe = client(
    { baseUrl: 'https://book.onagilysys.eu', tenantId: '10282', propertyId: 'CabotHighlands' },
    { fetchImpl },
  );
  const courses = await wbe.availability({ fromDate: '2026-09-25', toDate: '2026-09-25' });

  assert.equal(
    calls[0].url,
    'https://book.onagilysys.eu/wbe-golf-service/golf/tenants/10282/propertyId/CabotHighlands/multiCourse',
  );
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    fromDate: '2026-09-25', toDate: '2026-09-25', withBasePrice: true,
  });
  assert.equal(courses.length, 2);
});

test('the payment iframe is passed through without card details touching us', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => CABOT.payToken });
  const wbe = client(
    { baseUrl: 'https://book.onagilysys.eu', tenantId: '10282', propertyId: 'CabotHighlands' },
    { fetchImpl },
  );

  const session = await wbe.payToken();
  assert.equal(session.gatewayId, 'adyen');
  assert.match(session.iframeUrl, /^https:\/\/pay\.rguest\.eu\//);
  assert.equal(session.clientId, '67e6c1c2e43d592f328f7dca');
});

test('an HTTP failure carries the engine message through', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ Message: 'Cloud PMS unavailable', ErrorCode: 'CLOUD_CON_ERROR' }),
  });
  const wbe = client(
    { baseUrl: 'https://book.onagilysys.eu', tenantId: '10282', propertyId: 'CabotHighlands' },
    { fetchImpl },
  );

  await assert.rejects(() => wbe.propertyInfo(), /Cloud PMS unavailable/);
});
