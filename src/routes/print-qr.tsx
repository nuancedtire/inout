import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import QRCode from "qrcode";
import { Printer, LockKeyhole } from "lucide-react";
import { PinGate } from "#/components/PinGate";
import { adminGetCheckInCode } from "#/utils/rotas.functions";
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
  const [qrUrl, setQrUrl] = useState("");
  const [qrTextUrl, setQrTextUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const generate = async (authToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const { token } = await adminGetCheckInCode({ data: { authToken } });
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
      generate(authToken);
    }
  }, [authenticated, authToken]);

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError("");
    try {
      await login(pin);
      return true;
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      setLoginError(!text || /invalid.*pin/i.test(text) ? "Incorrect PIN. Please try again." : text);
      return false;
    } finally {
      setLoginLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <PinGate
        pin={pin}
        onPinChange={(value) => {
          setPin(value);
          if (loginError) setLoginError("");
        }}
        verifying={loginLoading}
        error={loginError}
        onUnlock={handleLogin}
        heading="Print check-in poster"
        label="InOut"
        subtitle="Enter the admin PIN to continue"
      />
    );
  }

  return (
    <>
      {/* Screen layout */}
      <main className="min-h-svh print:min-h-0 bg-surface-soft print:bg-white">
        {/* Toolbar — hidden when printing */}
        <header className="print:hidden sticky top-0 z-10 border-b border-hairline-soft bg-canvas/90 backdrop-blur pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <h1 className="text-base font-semibold text-ink">Check-in poster</h1>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={logout}>
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
            <div className="mx-auto flex aspect-[3/4] max-w-md items-center justify-center rounded-card border border-hairline-soft bg-canvas shadow-card print:hidden">
              <WorkingIndicator label="Generating QR…" size={72} />
            </div>
          ) : error ? (
            <div className="mx-auto max-w-md rounded-card border border-hairline-soft bg-canvas shadow-card">
              <EmptyState title="Cannot generate QR" description={error} icon="alert" />
            </div>
          ) : qrUrl ? (
            <article className="print-content animate-reveal print:animate-none mx-auto max-w-md rounded-card border border-hairline-soft bg-canvas px-8 py-10 text-center shadow-card print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
              <Wordmark size="md" animate="none" />
              <p className="mt-8 text-2xl font-bold tracking-tight text-ink">Scan to check in or out</p>
              <p className="mt-1 text-base font-medium text-body">Open your phone camera and point it here</p>
              <img
                src={qrUrl}
                alt="InOut check-in QR code"
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
                  Can't scan? Type this code in InOut:
                  <span className="mt-1 block whitespace-nowrap font-mono text-xl font-bold tracking-[0.12em] text-ink select-all">
                    {(new URL(qrTextUrl).searchParams.get('token') ?? '').replace(/(.{4})(?=.)/g, '$1 ')}
                  </span>
                </p>
              )}
              <p className="mt-6 text-sm text-muted">This code doesn’t change. Next time, open InOut from your Home Screen — no scan needed.</p>
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
