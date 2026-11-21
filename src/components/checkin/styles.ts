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

/* Location check in progress: two rings pulse outwards from the pin. */
.ck-radar { animation: ck-radar 1400ms cubic-bezier(0, 0, 0.2, 1) infinite; }
@keyframes ck-radar { from { transform: scale(1); opacity: 0.9; } to { transform: scale(2.1); opacity: 0; } }

/* Undo countdown ring. */
.ck-countdown { transition: stroke-dashoffset 1s linear; }

/* Page frame: side padding clears landscape notches; wide screens get more room. */
.ck-frame { padding-left: max(1.25rem, env(safe-area-inset-left)); padding-right: max(1.25rem, env(safe-area-inset-right)); }
@media (min-width: 640px) { .ck-frame.ck-wide { padding-left: max(2rem, env(safe-area-inset-left)); padding-right: max(2rem, env(safe-area-inset-right)); } }

/* Map heights follow the screen: compact on short phones, roomier on tall ones and two-column layouts. */
.checkin { --ck-map-h: 136px; --ck-map-lg: 152px; --ck-map-sm: 128px; }
@media (min-height: 740px) { .checkin { --ck-map-h: 164px; --ck-map-lg: 216px; --ck-map-sm: 148px; } }
@media (min-height: 880px) { .checkin { --ck-map-h: 188px; --ck-map-lg: 248px; --ck-map-sm: 168px; } }
@media (min-width: 640px) { .checkin { --ck-map-h: 232px; --ck-map-lg: 300px; --ck-map-sm: 200px; } }
@media (min-width: 640px) and (min-height: 820px) { .checkin { --ck-map-h: 300px; --ck-map-lg: 360px; --ck-map-sm: 240px; } }
@media (max-height: 520px) { .checkin { --ck-map-h: 120px; --ck-map-lg: 150px; --ck-map-sm: 110px; } }

/* Foldables and dual screens, side by side (book posture): one column per segment, the gap is the hinge. */
@media (horizontal-viewport-segments: 2) {
  .ck-frame { margin-left: env(viewport-segment-left 1 0); margin-right: 0; max-width: env(viewport-segment-width 1 0); }
  .ck-frame.ck-wide { margin: 0; max-width: none; padding-left: 0; padding-right: 0; }
  .ck-frame.ck-wide > header { padding-inline: 1.25rem; }
  .ck-wide .ck-split {
    display: grid; align-items: start;
    grid-template-columns: env(viewport-segment-width 0 0) env(viewport-segment-width 1 0);
    column-gap: calc(env(viewport-segment-left 1 0) - env(viewport-segment-right 0 0));
  }
  .ck-wide .ck-split > * { grid-column: 1; margin-inline: 1.25rem; min-width: 0; }
  .ck-wide .ck-split > .ck-seg-end { grid-column: 2; grid-row: 1 / span 6; }
}
/* Half-folded flat (tabletop): keep everything in the bottom half, nearest the thumb. */
@media (vertical-viewport-segments: 2) {
  .ck-frame { padding-top: calc(env(viewport-segment-top 0 1) + 0.5rem); }
}

/* Map "sonar" while a reading is taken. */
.ck-sonar { animation: ck-sonar 1800ms cubic-bezier(0, 0, 0.2, 1) infinite; }
@keyframes ck-sonar { from { transform: scale(0.2); opacity: 0.9; } to { transform: scale(1.4); opacity: 0; } }

/* Turn-on-location pictures: the setting to change glows softly. */
.ck-target { position: relative; z-index: 0; }
.ck-target::after { content: ''; position: absolute; inset: -3px; border-radius: inherit; box-shadow: 0 0 0 2px rgba(255,56,92,0.55); animation: ck-target 2200ms ease-in-out infinite; pointer-events: none; }
@keyframes ck-target { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
.ck-target.ck-in::after { inset: 3px; border-radius: 8px; box-shadow: inset 0 0 0 2px rgba(255,56,92,0.55); }

/* "Still blocked": a small nudge. */
.ck-nudge { animation: ck-nudge 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
@keyframes ck-nudge { 20%, 60% { transform: translateX(-4px); } 40%, 80% { transform: translateX(4px); } }

/* Reminder card: the example notification drops in; the bell rings once. */
.ck-notify { animation: ck-notify 520ms cubic-bezier(0.16, 1, 0.3, 1) 260ms both; }
@keyframes ck-notify { from { opacity: 0; transform: translateY(-10px) scale(0.97); } to { opacity: 1; transform: none; } }
.ck-bell { transform-origin: 50% 12%; animation: ck-bell 900ms cubic-bezier(0.36, 0.07, 0.19, 0.97) 700ms both; }
@keyframes ck-bell { 0%, 100% { transform: none; } 15% { transform: rotate(14deg); } 30% { transform: rotate(-12deg); } 45% { transform: rotate(8deg); } 60% { transform: rotate(-5deg); } 75% { transform: rotate(2deg); } }

/* Forgotten check-out: the clock hands settle on the shift's end. */
.ck-hand { transform-origin: 40px 40px; animation: ck-hand 900ms cubic-bezier(0.2, 0, 0, 1) 150ms both; }
@keyframes ck-hand { from { transform: rotate(var(--ck-from, -90deg)); } }

@media (prefers-reduced-motion: reduce) {
  .ck-notify, .ck-bell, .ck-hand { animation: none !important; }
  .checkin-sheet, .ck-screen, .ck-stagger > *, .ck-pop, .ck-halo, .ck-ring, .ck-pin, .ck-scan, .ck-corners, .ck-sweep, .ck-live::after, .ck-shimmer, .ck-radar, .ck-sonar, .ck-target::after, .ck-nudge {
    animation: none !important;
  }
  .ck-check-ring, .ck-check-tick { animation: none !important; stroke-dashoffset: 0; }
  .ck-ring-2, .ck-ring-3, .ck-halo { opacity: 0; }
  .ck-ring { opacity: 0.35; }
  .ck-countdown { transition: none; }
  .ck-shimmer { background: none; color: #3f3f3f; }
}
`
