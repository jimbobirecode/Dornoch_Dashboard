import { useCallback, useEffect, useState } from 'react';
import { bookingApi, BookingApiError } from '../lib/bookingApi.js';
import SearchBar from '../components/booking/SearchBar.jsx';
import TeeSheet from '../components/booking/TeeSheet.jsx';
import RatePicker from '../components/booking/RatePicker.jsx';
import Basket from '../components/booking/Basket.jsx';
import GuestForm from '../components/booking/GuestForm.jsx';
import Confirmation from '../components/booking/Confirmation.jsx';

/**
 * The visitor booking page.
 *
 * Four steps, in the order the engine enforces them: pick a time, confirm the
 * rate, give details, pay. The basket persists across all of them — and across
 * visits, since the server keeps it against a cookie — so a guest can leave
 * mid-booking and come back to what they had chosen.
 *
 * The club comes from `?club=`, falling back to whatever the deployment is
 * configured for. That is what lets one deployment serve Dornoch's own tee
 * sheet and Cabot's Agilysys one from the same pages.
 */
export default function Book() {
  const club = new URLSearchParams(window.location.search).get('club') ?? undefined;

  const [boot, setBoot] = useState(null);
  const [bootError, setBootError] = useState(null);

  const [date, setDate] = useState(null);
  const [players, setPlayers] = useState(2);
  const [timeRange, setTimeRange] = useState(null);

  const [sheet, setSheet] = useState(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetError, setSheetError] = useState(null);

  const [choosing, setChoosing] = useState(null);
  const [chooseError, setChooseError] = useState(null);
  const [busySlot, setBusySlot] = useState(null);

  const [summary, setSummary] = useState(null);
  const [cartBusy, setCartBusy] = useState(false);

  const [step, setStep] = useState('search');
  const [checkoutError, setCheckoutError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  // Config first: it carries the club's today, which is where the calendar
  // opens, and the window the date controls are clamped to.
  useEffect(() => {
    let cancelled = false;
    bookingApi.config(club)
      .then((payload) => {
        if (cancelled) return;
        setBoot(payload);
        setDate(payload.today);
      })
      .catch((err) => !cancelled && setBootError(err.message));
    return () => { cancelled = true; };
  }, [club]);

  const refreshCart = useCallback(
    () => bookingApi.cart(club).then(setSummary).catch(() => {}),
    [club],
  );

  useEffect(() => { refreshCart(); }, [refreshCart]);

  // The sheet is refetched whenever the search changes. A stale response from
  // a date the guest has already moved on from is dropped rather than rendered.
  useEffect(() => {
    if (!date) return undefined;

    let cancelled = false;
    setLoadingSheet(true);
    setSheetError(null);

    bookingApi.availability({ date, players, timeRange, club })
      .then((payload) => !cancelled && setSheet(payload))
      .catch((err) => {
        if (cancelled) return;
        setSheet(null);
        setSheetError(err.message);
      })
      .finally(() => !cancelled && setLoadingSheet(false));

    return () => { cancelled = true; };
  }, [date, players, timeRange, club]);

  async function addToBasket({ rateRef, players: party, rateName }) {
    setChooseError(null);
    setBusySlot(choosing.slot.scheduledDateTime + choosing.course.courseRef);
    try {
      const updated = await bookingApi.addToCart({
        courseRef: choosing.course.courseRef,
        rateRef,
        scheduledDateTime: choosing.slot.scheduledDateTime,
        players: party,
        courseName: choosing.course.name,
        rateName,
      }, club);

      setSummary(updated);
      setChoosing(null);
      // The sheet the guest is looking at now has fewer places on it.
      await bookingApi.availability({ date, players, timeRange, club })
        .then(setSheet)
        .catch(() => {});
    } catch (err) {
      setChooseError(err.message);
      if (err instanceof BookingApiError && err.code === 'SLOT_UNAVAILABLE') {
        bookingApi.availability({ date, players, timeRange, club }).then(setSheet).catch(() => {});
      }
    } finally {
      setBusySlot(null);
    }
  }

  async function removeFromBasket(itemId) {
    setCartBusy(true);
    try {
      setSummary(await bookingApi.removeCartItem(itemId, club));
    } catch (err) {
      setCheckoutError(err.message);
    } finally {
      setCartBusy(false);
    }
  }

  async function checkout({ guest, agreedToPolicy }) {
    setCheckoutError(null);
    setFieldErrors(null);
    try {
      // A real gateway hands back a token here; without one configured the
      // engine is told so explicitly rather than being passed a fake.
      const session = await bookingApi.paymentSession(club);
      const paymentReference = session.simulated
        ? `simulated-${Date.now()}`
        : session.paymentReference ?? null;

      const result = await bookingApi.checkout({ guest, agreedToPolicy, paymentReference }, club);
      setConfirmation(result);
      setSummary(null);
      setStep('done');
    } catch (err) {
      setCheckoutError(err.message);
      if (err instanceof BookingApiError && err.code === 'GUEST_INVALID') {
        setFieldErrors(err.details);
      }
      if (err instanceof BookingApiError && err.code === 'CART_STALE') {
        await refreshCart();
        setStep('search');
      }
    }
  }

  if (bootError) {
    return <div className="book-page"><div className="empty">{bootError}</div></div>;
  }
  if (!boot || !date) {
    return <div className="book-page"><div className="empty">Loading tee times…</div></div>;
  }

  const { config } = boot;

  return (
    <div className="book-page">
      <header className="book-head">
        <h1>{config.propertyName}</h1>
        <p className="muted">Visitor tee times</p>
      </header>

      {step === 'done' && confirmation ? (
        <Confirmation
          confirmation={confirmation}
          config={config}
          onBookAnother={() => { setConfirmation(null); setStep('search'); refreshCart(); }}
        />
      ) : (
        <div className="book-layout">
          <div className="book-main">
            {step === 'details' ? (
              <GuestForm
                config={config}
                totals={summary?.totals ?? {}}
                onSubmit={checkout}
                onBack={() => { setStep('search'); setCheckoutError(null); setFieldErrors(null); }}
                error={checkoutError}
                fieldErrors={fieldErrors}
              />
            ) : choosing ? (
              <RatePicker
                course={choosing.course}
                slot={choosing.slot}
                players={players}
                config={config}
                error={chooseError}
                onConfirm={addToBasket}
                onCancel={() => { setChoosing(null); setChooseError(null); }}
              />
            ) : (
              <>
                <SearchBar
                  date={date}
                  players={players}
                  timeRange={timeRange}
                  config={config}
                  window={boot.window}
                  onChange={(patch) => {
                    if (patch.date !== undefined) setDate(patch.date);
                    if (patch.players !== undefined) setPlayers(patch.players);
                    if (patch.timeRange !== undefined) setTimeRange(patch.timeRange);
                  }}
                />

                {sheetError && <div className="empty">{sheetError}</div>}
                {loadingSheet && <div className="empty">Checking availability…</div>}
                {!loadingSheet && !sheetError && sheet && (
                  <TeeSheet
                    courses={sheet.courses}
                    players={players}
                    config={config}
                    busySlot={busySlot}
                    onSelect={(course, slot) => { setChooseError(null); setChoosing({ course, slot }); }}
                  />
                )}
              </>
            )}
          </div>

          <Basket
            summary={summary}
            config={config}
            busy={cartBusy}
            onRemove={removeFromBasket}
            onCheckout={() => { setCheckoutError(null); setStep('details'); }}
          />
        </div>
      )}
    </div>
  );
}
