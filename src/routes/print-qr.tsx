import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import QRCode from "qrcode";
import { QrCode, Printer, CalendarDays } from "lucide-react";
import { getQrTokenOrSeed } from "#/utils/rotas.functions";
import { todayDate } from "#/utils/dateTime";
import { ErrorFallback } from "#/components/ErrorFallback";
import { EmptyState } from "#/components/EmptyState";
import { Button } from "#/components/Button";
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
      <main className="min-h-screen flex items-center justify-center bg-neutral-50 p-6 print:bg-white">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center">
            <QrCode className="w-12 h-12 mx-auto text-primary-600" />
            <h1 className="text-xl font-bold mt-2 text-neutral-900">
              Print QR Code
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Enter admin PIN to access
            </p>
          </div>
          <input
            type="password"
            placeholder="Admin PIN"
            aria-label="Admin PIN"
            className="w-full p-3 border border-neutral-300 rounded-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogin();
            }}
          />
          {loginError && (
            <p className="text-sm text-danger-600">{loginError}</p>
          )}
          <Button fullWidth loading={loginLoading} onClick={handleLogin}>
            Unlock
          </Button>
        </div>
      </main>
    );
  }

  return (
    <>
      {/* Screen layout */}
      <main className="min-h-screen print:min-h-0 bg-neutral-50 p-6 print:p-0 print:bg-white">
        {/* Toolbar — hidden when printing */}
        <div className="print:hidden max-w-2xl mx-auto mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-neutral-900">
              Print QR Code
            </h1>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-neutral-400" />
              <input
                type="date"
                aria-label="Select date"
                className="p-2 border border-neutral-300 rounded-lg text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={logout}>
              Lock
            </Button>
            <Button onClick={() => window.print()} size="sm">
              <Printer className="w-4 h-4 mr-1" />
              Print
            </Button>
          </div>
        </div>

        {/* QR content */}
        {loading ? (
          <div className="max-w-md mx-auto mt-20 print:mt-0">
            <div className="aspect-square bg-neutral-100 rounded-lg flex flex-col items-center justify-center text-neutral-400 animate-pulse print:animate-none print:bg-white">
              <QrCode className="w-16 h-16 mb-3" />
              <span className="text-sm font-medium">Generating QR…</span>
            </div>
          </div>
        ) : error ? (
          <div className="max-w-md mx-auto mt-20 print:mt-0">
            <EmptyState
              title="Cannot generate QR"
              description={error}
              icon="alert"
            />
          </div>
        ) : qrUrl ? (
          <div className="print-content max-w-lg mx-auto">
            <div className="text-center mb-4">
              <p className="text-lg font-bold text-neutral-900">
                Staff In &amp; Out
              </p>
              <p className="text-2xl font-bold text-neutral-900 mt-1">{date}</p>
              <p className="text-sm text-neutral-500 mt-1">
                Scan to check in / out
              </p>
            </div>
            <img
              src={qrUrl}
              alt={`QR code for ${date}`}
              className="w-full max-w-md mx-auto block"
            />
            {/* Text URL fallback — scannable if QR is damaged */}
            {qrTextUrl && (
              <p className="mt-4 text-xs text-muted font-mono break-all text-center select-all">
                {qrTextUrl}
              </p>
            )}
            {/* Dotted cut guide — visible in print */}
            <div className="mt-8 border-t-2 border-dashed border-neutral-300 print:border-neutral-400" />
          </div>
        ) : null}
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
            max-width: 80% !important;
          }
        }
      `}</style>
    </>
  );
}
