import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import QRCode from "qrcode";
import { Printer, CalendarDays, LockKeyhole } from "lucide-react";
import { getQrTokenOrSeed } from "#/utils/rotas.functions";
import { todayDate } from "#/utils/dateTime";
import { ErrorFallback } from "#/components/ErrorFallback";
import { EmptyState } from "#/components/EmptyState";
import { Button } from "#/components/Button";
import { Wordmark } from "#/components/brand/Wordmark";
import { WorkingIndicator } from "#/components/brand/WorkingIndicator";
import { usePersistentAdminAuth } from "#/routes/admin/-hooks";

export const Route = createFileRoute("/print-qr")({
  component: PrintQrPage,
  errorComponent: ErrorFallback,
});

function PrintQrPage() {
  const { authenticated, authToken, pin, setPin, login, logout } =
    usePersistentAdminAuth();
  const [date, setDate] = useState(todayDate());
  const [qrUrl, setQrUrl] = useState("");
  const [qrTextUrl, setQrTextUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const generate = async (targetDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const { token } = await getQrTokenOrSeed({ data: { date: targetDate } });
      if (!token) {
        setError("No rota for this date. Upload a rota first.");
        setQrUrl("");
        setQrTextUrl("");
        return;
      }
      const url = `${window.location.origin}/?token=${token}`;
      const dataUrl = await QRCode.toDataURL(url, { width: 800 });
      setQrUrl(dataUrl);
      setQrTextUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate QR");
      setQrUrl("");
      setQrTextUrl("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated && authToken) {
      generate(date);
    }
  }, [authenticated, authToken, date]);

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError("");
    try {
      await login(pin);
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "Invalid PIN");
    } finally {
      setLoginLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <main className="min-h-svh flex items-center justify-center bg-surface-soft px-4 py-12 pt-safe">
        <div className="w-full max-w-sm text-center">
          <Wordmark size="sm" animate={loginLoading ? "run" : "idle"} />
          <h1 className="mt-6 text-2xl font-semibold text-ink">Print QR code</h1>
          <p className="mt-1 text-sm text-muted">Enter the admin PIN to continue</p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!loginLoading) handleLogin();
            }}
            className="animate-reveal mt-6 rounded-lg border border-hairline-soft bg-canvas p-6 text-left shadow-card"
          >
            <label htmlFor="print-pin" className="mb-2 block text-sm font-semibold text-ink">
              Admin PIN
            </label>
            <input
              id="print-pin"
              type="password"
              autoComplete="current-password"
              aria-invalid={loginError ? true : undefined}
              aria-describedby="print-pin-feedback"
              className={`block min-h-12 w-full rounded-control border bg-canvas px-4 text-base text-ink outline-none transition-[border-color,box-shadow] ${
                loginError
                  ? "border-danger-600 focus-visible:shadow-[0_0_0_1px_var(--color-danger-600)]"
                  : "border-hairline hover:border-neutral-400 focus-visible:border-ink focus-visible:shadow-[0_0_0_1px_var(--color-ink)]"
              }`}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
            <p id="print-pin-feedback" aria-live="polite" className="min-h-11 pt-2.5 text-sm text-danger-700">
              {loginError}
            </p>
            <Button type="submit" size="lg" fullWidth loading={loginLoading}>
              Unlock
            </Button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <>
      {/* Screen layout */}
      <main className="min-h-svh print:min-h-0 bg-surface-soft print:bg-white">
        {/* Toolbar — hidden when printing */}
        <header className="print:hidden sticky top-0 z-10 border-b border-hairline-soft bg-canvas/90 backdrop-blur pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <h1 className="text-base font-semibold text-ink">Print QR code</h1>
            <label className="flex items-center gap-2 text-sm text-muted">
              <CalendarDays className="size-4" aria-hidden="true" />
              <span className="sr-only">Select date</span>
              <input
                type="date"
                aria-label="Select date"
                className="min-h-9 rounded-control border border-hairline bg-canvas px-3 text-sm text-ink outline-none hover:border-neutral-400 focus-visible:border-ink focus-visible:shadow-[0_0_0_1px_var(--color-ink)]"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={logout}>
                <LockKeyhole className="size-4" aria-hidden="true" />
                Lock
              </Button>
              <Button onClick={() => window.print()} size="sm" disabled={!qrUrl || loading}>
                <Printer className="size-4" aria-hidden="true" />
                Print
              </Button>
            </div>
          </div>
        </header>

        <div className="px-4 py-8 sm:py-12 print:p-0">
          {/* QR content */}
          {loading ? (
            <div className="mx-auto flex aspect-[3/4] max-w-md items-center justify-center rounded-lg border border-hairline-soft bg-canvas shadow-card print:hidden">
              <WorkingIndicator label="Generating QR…" size={72} />
            </div>
          ) : error ? (
            <div className="mx-auto max-w-md rounded-lg border border-hairline-soft bg-canvas shadow-card">
              <EmptyState title="Cannot generate QR" description={error} icon="alert" />
            </div>
          ) : qrUrl ? (
            <article className="print-content animate-reveal print:animate-none mx-auto max-w-md rounded-lg border border-hairline-soft bg-canvas px-8 py-10 text-center shadow-card print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
              <Wordmark size="md" animate="none" />
              <p className="mt-8 text-2xl font-bold tracking-tight text-ink">Scan to check in or out</p>
              <p className="mt-1 text-base font-medium text-body">{longDate(date)}</p>
              <img
                src={qrUrl}
                alt={`QR code for ${longDate(date)}`}
                className="mx-auto mt-6 block w-full max-w-sm [image-rendering:pixelated]"
              />
              {/* Text URL fallback — usable if the code is damaged */}
              {qrTextUrl && (
                <p className="mt-4 break-all text-center font-mono text-xs text-muted select-all">
                  {qrTextUrl}
                </p>
              )}
              {qrTextUrl && (
                <p className="mt-6 text-base text-body">
                  Can't scan? Type this code in InOut:{' '}
                  <span className="font-mono text-lg font-bold tracking-[0.12em] text-ink select-all">
                    {(new URL(qrTextUrl).searchParams.get('token') ?? '').replace(/(.{4})(?=.)/g, '$1 ')}
                  </span>
                </p>
              )}
              <p className="mt-6 text-sm text-muted">Valid for this date only. A new code is issued each day.</p>
              {/* Dotted cut guide — visible in print */}
              <div className="mt-8 hidden border-t-2 border-dashed border-neutral-400 print:block" aria-hidden="true" />
            </article>
          ) : null}
        </div>
      </main>

      {/* Print-specific styles */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 15mm;
          }
          html, body {
            height: auto !important;
            min-height: 0 !important;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-content {
            max-width: 100% !important;
            margin-top: 0 !important;
          }
          .print-content img {
            max-width: 75% !important;
          }
          .print-content .wm {
            font-size: 2.5rem;
          }
        }
      `}</style>
    </>
  );
}

/** "2026-11-20" → "Friday 20 November 2026" (date-only, so formatted in UTC to avoid shifts). */
function longDate(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}
