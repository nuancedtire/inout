/**
 * Motion for the staff check-in screens. Rendered once through React 19's hoisted <style> (deduped
 * by `href`), so these keyframes live with the components that use them instead of global CSS.
 * Every effect is decorative and switched off under prefers-reduced-motion.
 */
export const CHECKIN_CSS = `
.checkin-sheet { animation: ck-sheet-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes ck-sheet-in { from { transform: translateY(100%); } to { transform: none; } }
@media (min-width: 640px) { .checkin-sheet { animation-name: ck-pop-in; } }
@keyframes ck-pop-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: none; } }

.ck-screen { animation: ck-screen-in 420ms cubic-bezier(0.2, 0, 0, 1) both; }
@keyframes ck-screen-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.ck-stagger > * { animation: ck-screen-in 480ms cubic-bezier(0.2, 0, 0, 1) both; }
.ck-stagger > *:nth-child(2) { animation-delay: 60ms; }
.ck-stagger > *:nth-child(3) { animation-delay: 120ms; }
.ck-stagger > *:nth-child(4) { animation-delay: 180ms; }
.ck-stagger > *:nth-child(5) { animation-delay: 240ms; }
.ck-stagger > *:nth-child(n+6) { animation-delay: 300ms; }

/* Success: ring fills, check draws, badge pops. */
.ck-check-ring { stroke-dasharray: 164; stroke-dashoffset: 164; animation: ck-draw 700ms cubic-bezier(0.65, 0, 0.35, 1) 120ms forwards; }
.ck-check-tick { stroke-dasharray: 48; stroke-dashoffset: 48; animation: ck-draw 420ms cubic-bezier(0.65, 0, 0.35, 1) 620ms forwards; }
@keyframes ck-draw { to { stroke-dashoffset: 0; } }
.ck-pop { animation: ck-pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) 560ms both; }
@keyframes ck-pop { from { transform: scale(0.4); opacity: 0; } to { transform: none; opacity: 1; } }
.ck-halo { animation: ck-halo 1400ms cubic-bezier(0.2, 0, 0, 1) 500ms both; }
@keyframes ck-halo { from { transform: scale(0.6); opacity: 0.55; } to { transform: scale(1.6); opacity: 0; } }

/* Location: soft radar rings. */
.ck-ring { transform-origin: center; transform-box: fill-box; animation: ck-ring 2600ms cubic-bezier(0.2, 0, 0, 1) infinite; }
.ck-ring-2 { animation-delay: 870ms; }
.ck-ring-3 { animation-delay: 1740ms; }
@keyframes ck-ring { from { transform: scale(0.35); opacity: 0.9; } to { transform: scale(1); opacity: 0; } }
.ck-pin { animation: ck-pin 2600ms cubic-bezier(0.45, 0, 0.55, 1) infinite; transform-box: fill-box; transform-origin: 50% 100%; }
@keyframes ck-pin { 0%, 100% { transform: none; } 50% { transform: translateY(-4px); } }

/* Face ID / fingerprint: a scan line sweeps the glyph. */
.ck-scan { animation: ck-scan 2400ms cubic-bezier(0.45, 0, 0.55, 1) infinite; }
@keyframes ck-scan { 0%, 100% { transform: translateY(-34%); opacity: 0; } 15%, 85% { opacity: 1; } 50% { transform: translateY(34%); } }

/* QR viewfinder corners breathe; scan line sweeps. */
.ck-corners { animation: ck-breathe 2200ms ease-in-out infinite; }
@keyframes ck-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(0.965); } }
.ck-sweep { animation: ck-sweep 2200ms cubic-bezier(0.45, 0, 0.55, 1) infinite; }
@keyframes ck-sweep { 0% { top: 12%; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { top: 88%; opacity: 0; } }
.ck-found { animation: ck-found 600ms cubic-bezier(0.2, 0, 0, 1) both; }
@keyframes ck-found { from { box-shadow: inset 0 0 0 0 rgba(0,138,5,0.9); } to { box-shadow: inset 0 0 0 6px rgba(0,138,5,0.9); } }

/* Live "on shift" dot. */
.ck-live { position: relative; }
.ck-live::after { content: ''; position: absolute; inset: 0; border-radius: 9999px; background: currentColor; animation: ck-live 2000ms cubic-bezier(0, 0, 0.2, 1) infinite; }
@keyframes ck-live { from { transform: scale(1); opacity: 0.6; } to { transform: scale(2.6); opacity: 0; } }

/* Slide label: a soft highlight sweeps across the words, hinting at the direction. */
.ck-shimmer {
  background: linear-gradient(100deg, #3f3f3f 40%, #a8a8a8 50%, #3f3f3f 60%) 0 0 / 250% 100% no-repeat;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: ck-shimmer 2600ms linear infinite;
}
@keyframes ck-shimmer { from { background-position: 100% 0; } to { background-position: -50% 0; } }

/* Undo countdown ring. */
.ck-countdown { transition: stroke-dashoffset 1s linear; }

@media (prefers-reduced-motion: reduce) {
  .checkin-sheet, .ck-screen, .ck-stagger > *, .ck-pop, .ck-halo, .ck-ring, .ck-pin, .ck-scan, .ck-corners, .ck-sweep, .ck-live::after, .ck-shimmer {
    animation: none !important;
  }
  .ck-check-ring, .ck-check-tick { animation: none !important; stroke-dashoffset: 0; }
  .ck-ring-2, .ck-ring-3, .ck-halo { opacity: 0; }
  .ck-ring { opacity: 0.35; }
  .ck-countdown { transition: none; }
  .ck-shimmer { background: none; color: #3f3f3f; }
}
`
