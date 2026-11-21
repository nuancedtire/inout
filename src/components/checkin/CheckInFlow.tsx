import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { RunnerMark } from '#/components/brand/RunnerMark'
import { beginEnrolment, beginPasskeyAuth, finishEnrolment, getStaffStatus, passkeyAction } from '#/utils/passkeys.functions'
import type { ActionResult, StaffStatus } from '#/utils/passkeys.functions'
import { checkIn, checkOut, getStatus, manualCheckIn, undoLastAction } from '#/utils/sessions.functions'
import { getForgottenCheckout, reportForgottenCheckout, type ForgottenCheckout } from '#/utils/reminders.functions'
import type { LocationReading } from '#/utils/location'
import type { PublicArea } from '#/utils/passkeys.functions'
import type { MapFix } from '#/components/maps/AreaMap'
import { classifyServerError, type CheckinError } from '#/lib/checkinErrors'
import {
  clearStoredToken,
  forgetStaff,
  locationExplained,
  markLocationExplained,
  markLocationWorked,
  readRememberedStaff,
  readRosterEntry,
  readStoredToken,
  rememberRosterEntry,
  rememberStaff,
  storeToken,
  type RememberedStaff,
} from '#/lib/checkinStorage'
import { locationPermission, startLocationSampler, type LocationSampler, type SampleResult } from '#/lib/geolocation'
import {
  cancelPasskeyCeremony,
  createPasskey,
  PasskeyError,
  passkeysSupported,
  signalUnknownPasskey,
  signWithPasskey,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '#/lib/passkeyClient'
import { currentPlatform, isStandalone, unlockCopy, type Platform } from '#/lib/platform'
import { ALLOW_CHECKIN_WITHOUT_LOCATION } from '#/lib/locationPolicy'
import { isValidToken } from '#/lib/qrScanner'
import { snoozeInstallCard } from '#/lib/installPrompt'
import { capitalise, shiftLabel } from './copy'
import { ForgottenScreen, type ForgottenNotice } from './ForgottenScreen'
import { InstallGuide } from './InstallGuide'
import { ReminderCard } from './ReminderCard'
import { useReminders } from './useReminders'
import { HomeScreen, IdentityMenu } from './HomeScreen'
import { LocationExplainer } from './LocationExplainer'
import { LocationHelp, type HelpMode } from './LocationHelp'
import { LocationStatus, type LocationFix } from './LocationStatus'
import { ConfirmPersonSheet, LocumForm, personName, personRole, type Person } from './LocumForm'
import { PasskeySetupScreen, type SetupProblem } from './PasskeySetupScreen'
import { ResultScreen, UNDO_WINDOW_MS, type ShownResult } from './ResultScreen'
import { RosterPicker, type RosterEntry } from './RosterPicker'
import { ScanScreen } from './ScanScreen'
import { BackButton, Notice, Shell, StepProgress, TextLink } from './ui'
import { WelcomeScreen, type WelcomeNotice } from './WelcomeScreen'
import { WorkingScreen, type WorkStage } from './WorkingScreen'
import { useCheckInArea, useLocationPermission } from './useLocation'

export type RosterData = {
  rota: { id: number; date: string } | null
  locationCheck: boolean
  entries: RosterEntry[]
}

type Purpose = 'enrol' | 'fallback'
type ForgottenState = { session: ForgottenCheckout; busy: boolean; notice: ForgottenNotice; saved: { at: string } | null }
type Work = { title: string; stages: WorkStage[]; current: number; position?: MapFix | null }
type HomeNoticeData = { tone: 'neutral' | 'warning' | 'danger'; title: string; message: string } | null
type ResultState = {
  result: ShownResult | null
  enrolledOnly?: { alreadyIn: boolean }
  approximate: boolean
  showInstall: boolean
  undoUntil: number | null
  via: 'passkey' | 'fallback'
  /** The reading used, for the result map (own screen only). */
  position: MapFix | null
}

type View =
  | { name: 'boot' }
  | { name: 'no-rota' }
  | { name: 'scan'; notice?: { title: string; message: string } | null }
  | { name: 'welcome' }
  | { name: 'who'; purpose: Purpose }
  | { name: 'locum'; purpose: Purpose }
  | { name: 'passkey' }
  | { name: 'explain'; actionLabel: string }
  | { name: 'location-off'; mode: HelpMode }
  | { name: 'working' }
  | { name: 'result' }
  | { name: 'home' }

const FALLBACK_KEY = 'inout-fallback-mode'
const ENROL_FRESH_MS = 4 * 60 * 1000

function setFallbackFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(FALLBACK_KEY, '1')
    else {
      localStorage.removeItem(FALLBACK_KEY)
      localStorage.removeItem(FALLBACK_ENTRY_KEY)
    }
  } catch {
    // Storage unavailable.
  }
}
const FALLBACK_ENTRY_KEY = 'inout-fallback-entry'
function storeFallbackEntry(entry: RosterEntry | null) {
  try {
    if (entry) localStorage.setItem(FALLBACK_ENTRY_KEY, JSON.stringify(entry))
    else localStorage.removeItem(FALLBACK_ENTRY_KEY)
  } catch {
    // Storage unavailable.
  }
}
function readFallbackEntry(id: number | null): RosterEntry | null {
  try {
    const raw = localStorage.getItem(FALLBACK_ENTRY_KEY)
    const entry = raw ? (JSON.parse(raw) as RosterEntry) : null
    return entry && entry.id === id ? entry : null
  } catch {
    return null
  }
}
function fallbackFlag() {
  try {
    return localStorage.getItem(FALLBACK_KEY) === '1'
  } catch {
    return false
  }
}

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false

/** The person backed out of the "Turn on location" screen mid check-in. Nothing is recorded. */
class LocationCancelled extends Error {}

const DENIED_SAMPLE: SampleResult = { reading: { status: 'denied' }, approximate: false }
const fixOf = (s: SampleResult | null): MapFix | null =>
  s?.reading.status === 'ok' ? { latitude: s.reading.latitude, longitude: s.reading.longitude, accuracy: s.reading.accuracy } : null
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Let the dot land on the map before the result replaces it, without slowing a slow save further. */
const afterDot = <T,>(p: Promise<T>, shown: boolean): Promise<T> => (shown ? Promise.all([p, pause(550)]).then(([v]) => v) : p)

type AuthOptions = Awaited<ReturnType<typeof beginPasskeyAuth>>
type EnrolOptions = Awaited<ReturnType<typeof beginEnrolment>>

/** A promise plus its value once settled, so a ready value can be used synchronously inside a tap. */
type Pending<T> = { at: number; promise: Promise<T>; value?: T; error?: unknown }
function track<T>(promise: Promise<T>): Pending<T> {
  const p: Pending<T> = { at: Date.now(), promise }
  promise.then((v) => { p.value = v }, (e) => { p.error = e })
  promise.catch(() => {})
  return p
}

export function CheckInFlow({ data, urlToken }: { data: RosterData; urlToken: string | undefined }) {
  const { rota, entries, locationCheck } = data
  const navigate = useNavigate()

  const [view, setView] = useState<View>({ name: 'boot' })
  const [platform, setPlatform] = useState<Platform>('other')
  const [supported, setSupported] = useState(true)
  const [token, setToken] = useState<string | null>(null)
  const [me, setMe] = useState<RememberedStaff | null>(null)
  const [status, setStatus] = useState<StaffStatus | null>(null)
  const [fallbackEntry, setFallbackEntry] = useState<RosterEntry | null>(null)
  const [fallbackStatus, setFallbackStatus] = useState<{ checkedIn: boolean; checkInAt: string | null } | null>(null)
  const [welcomeNotice, setWelcomeNotice] = useState<WelcomeNotice>(null)
  const [homeNotice, setHomeNotice] = useState<HomeNoticeData>(null)
  const [identifyBusy, setIdentifyBusy] = useState(false)
  // A passkey user who chose "Check in without Face ID" for now (e.g. a phone whose Face ID fails).
  const [forceFallback, setForceFallback] = useState(false)
  // "You didn't check out": a shift left open well past its end, asked about before Home.
  const [forgotten, setForgotten] = useState<ForgottenState | null>(null)
  const forgottenDismissed = useRef(new Set<number>())
  const forgottenChecked = useRef<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  // Sign-up
  const [person, setPerson] = useState<Person | null>(null)
  const [confirming, setConfirming] = useState<{ person: Person; purpose: Purpose } | null>(null)
  const [checkInNow, setCheckInNow] = useState(true)
  const [setupBusy, setSetupBusy] = useState(false)
  const [setupProblem, setSetupProblem] = useState<SetupProblem | null>(null)

  const [work, setWork] = useState<Work | null>(null)
  const [resultState, setResultState] = useState<ResultState | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)

  const authRef = useRef<Pending<AuthOptions> | null>(null)
  const enrolRef = useRef<(Pending<EnrolOptions> & { person: Person }) | null>(null)
  const samplerRef = useRef<LocationSampler | null>(null)
  // A fresh, precise reading from the on-screen location panel, reused by the next check-in.
  const fixRef = useRef<LocationFix | null>(null)
  const onFix = useCallback((fix: LocationFix) => {
    fixRef.current = fix
    blockedRef.current = false
  }, [])
  const explainRef = useRef<((r: SampleResult) => void) | null>(null)
  // Check-in waiting on the "Turn on location" screen.
  const helpRef = useRef<{ resolve: (r: SampleResult) => void; reject: (e: unknown) => void } | null>(null)
  // Location is known to be refused on this phone (Permissions API, or a refused reading on this page).
  const blockedRef = useRef(false)
  const onBlocked = useCallback(() => { blockedRef.current = true }, [])
  const [helpReady, setHelpReady] = useState(false)
  const permission = useLocationPermission()
  useEffect(() => {
    if (permission === 'denied') blockedRef.current = true
    if (permission === 'granted') blockedRef.current = false
  }, [permission])
  const fetchedArea = useCheckInArea(token, locationCheck)
  const [previewArea, setPreviewArea] = useState<PublicArea | null | undefined>(undefined)
  const area = previewArea !== undefined ? previewArea : fetchedArea
  const tokenRef = useRef<string | null>(null)
  tokenRef.current = token

  const unlock = unlockCopy(platform)

  // Shift-end reminders need this phone's passkey identity (not "without Face ID").
  const passkeyMode = !!me && !(forceFallback && !!fallbackEntry)
  const reminders = useReminders({
    token,
    staffToken: me?.staffToken ?? null,
    staffId: passkeyMode ? me?.staff.id ?? null : null,
    platform,
    active: passkeyMode,
  })
  const settleReminders = reminders.settle

  // Each step starts at the top (the heading also takes focus).
  useEffect(() => {
    window.scrollTo({ top: 0 })
    settleReminders()
  }, [view.name, settleReminders])

  // ── Challenge prefetch ──────────────────────────────────────────────────────
  const prefetchAuth = useCallback(() => {
    const t = tokenRef.current
    if (!t || !passkeysSupported()) return
    authRef.current = track(beginPasskeyAuth({ data: { token: t } }))
  }, [])

  /** The prefetched challenge if ready and fresh (synchronous), else a promise for a new one. */
  const takeAuth = useCallback((): AuthOptions | Promise<AuthOptions> => {
    const cached = authRef.current
    authRef.current = null
    if (cached?.value && Date.now() - cached.at < ENROL_FRESH_MS) return cached.value
    if (cached && !cached.error && cached.value === undefined && Date.now() - cached.at < ENROL_FRESH_MS) return cached.promise
    return beginPasskeyAuth({ data: { token: tokenRef.current ?? '' } })
  }, [])

  const assert = (options: AuthOptions | Promise<AuthOptions>): Promise<AuthenticationResponseJSON> =>
    options instanceof Promise
      ? options.then((o) => signWithPasskey(o.optionsJSON))
      : signWithPasskey(options.optionsJSON)

  // Refresh the challenge when the page comes back after a while.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const cached = authRef.current
      if (tokenRef.current && (!cached || Date.now() - cached.at > ENROL_FRESH_MS)) prefetchAuth()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [prefetchAuth])

  // ── Remembering who is on this phone ────────────────────────────────────────
  const adoptIdentity = useCallback((next: RememberedStaff, nextStatus: StaffStatus) => {
    rememberStaff(next)
    setMe(next)
    setStatus(nextStatus)
    rememberRosterEntry(nextStatus.rosterEntryId)
    setFallbackFlag(false)
    setFallbackEntry(null)
    setForceFallback(false)
  }, [])

  const forgetReminders = reminders.forget
  const signOut = useCallback(() => {
    cancelPasskeyCeremony()
    const leaving = readRememberedStaff()
    if (leaving) void forgetReminders(leaving.staffToken)
    setForgotten(null)
    forgottenChecked.current = null
    forgetStaff()
    setFallbackFlag(false)
    setMe(null)
    setStatus(null)
    setFallbackEntry(null)
    setFallbackStatus(null)
    setForceFallback(false)
    setHomeNotice(null)
    setWelcomeNotice({ tone: 'neutral', title: 'Removed from this phone', message: 'Your passkey is still saved on the phone. Sign in again any time.' })
    setView({ name: 'welcome' })
  }, [forgetReminders])

  const goScan = useCallback((notice?: { title: string; message: string }) => {
    if (rota) clearStoredToken(rota.date)
    setToken(null)
    setView({ name: 'scan', notice: notice ?? null })
  }, [rota])

  /** Shared handling for server errors that change where the person should be. Returns true if handled. */
  const routeError = useCallback((err: CheckinError, credentialId?: string): boolean => {
    if (err.kind === 'qr_expired') {
      goScan({ title: err.title, message: err.message })
      return true
    }
    if (err.kind === 'revoked' || err.kind === 'not_enrolled' || err.kind === 'inactive') {
      if (err.kind === 'not_enrolled' && credentialId) signalUnknownPasskey(credentialId)
      forgetStaff()
      setMe(null)
      setStatus(null)
      setWelcomeNotice({ tone: 'warning', title: err.title, message: err.message })
      setView({ name: 'welcome' })
      return true
    }
    return false
  }, [goScan])

  // ── Entering with a token ───────────────────────────────────────────────────
  const enterWithToken = useCallback(async (t: string) => {
    if (rota) storeToken(rota.date, t)
    setToken(t)
    tokenRef.current = t
    const remembered = readRememberedStaff()
    if (remembered) {
      setMe(remembered)
      setStatus(null)
      setView({ name: 'home' })
      try {
        const res = await getStaffStatus({ data: { token: t, staffToken: remembered.staffToken } })
        if (!res.staff) {
          forgetStaff()
          setMe(null)
          setWelcomeNotice({ tone: 'neutral', title: 'Please sign in again', message: `We couldn’t confirm this phone. Continue with your passkey, or set it up again.` })
          setView({ name: 'welcome' })
        } else {
          const next = { staffToken: remembered.staffToken, staff: res.staff, credentialStatus: res.credentialStatus }
          rememberStaff(next)
          setMe(next)
          setStatus(res.status)
          rememberRosterEntry(res.status.rosterEntryId)
        }
        prefetchAuth()
      } catch (e) {
        const err = classifyServerError(e, online())
        if (!routeError(err)) setHomeNotice({ tone: 'warning', title: err.title, message: err.message })
      }
      return
    }

    const savedEntry = readRosterEntry()
    const todayPick = fallbackFlag() && savedEntry ? entries.find((e) => e.id === savedEntry) : undefined
    // Yesterday's entry (a night shift) stays usable only while that session is still open.
    const carriedPick = !todayPick && fallbackFlag() ? readFallbackEntry(savedEntry) : null
    const fallbackPick = todayPick ?? carriedPick
    if (fallbackPick) {
      const carried = !todayPick
      const s = await getStatus({ data: { rosterEntryId: fallbackPick.id } }).catch(() => null)
      if (!carried || s?.checkedIn) {
        setFallbackEntry(fallbackPick)
        setFallbackStatus(s ?? { checkedIn: false, checkInAt: null })
        setView({ name: 'home' })
        return
      }
      setFallbackFlag(false)
    }

    // Unknown phone: check the code is current before asking anyone to sign up.
    try {
      await getStaffStatus({ data: { token: t, staffToken: 'none' } })
      setView({ name: 'welcome' })
      prefetchAuth()
    } catch (e) {
      const err = classifyServerError(e, online())
      if (!routeError(err)) {
        setWelcomeNotice({ tone: 'warning', title: err.title, message: err.message })
        setView({ name: 'welcome' })
      }
    }
  }, [entries, prefetchAuth, rota, routeError])

  // ── Boot (client only: everything here reads browser state) ────────────────
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    setPlatform(currentPlatform())
    setSupported(passkeysSupported())
    void locationPermission().then((p) => p === 'granted' && markLocationExplained())

    const fromUrl = urlToken ? urlToken.trim().toUpperCase() : ''
    if (urlToken !== undefined) {
      // Strip the token from the address bar (screenshots and shares never carry it); keep it in memory.
      void navigate({ to: '/', search: { token: undefined }, replace: true })
    }
    if (!rota) {
      setView({ name: 'no-rota' })
      return
    }
    const remembered = readRememberedStaff()
    if (remembered) setMe(remembered)
    if (fromUrl && !isValidToken(fromUrl)) {
      setView({ name: 'scan', notice: { title: 'That QR code isn’t recognised', message: 'Scan the InOut QR code in the department.' } })
      return
    }
    const t = fromUrl || readStoredToken(rota.date)
    if (!t) {
      setView({ name: 'scan' })
      return
    }
    void enterWithToken(t)
  }, [enterWithToken, navigate, rota, urlToken])

  // ── Location ────────────────────────────────────────────────────────────────
  const warmLocation = useCallback(() => {
    if (!locationCheck || !locationExplained() || samplerRef.current) return
    samplerRef.current = startLocationSampler()
  }, [locationCheck])

  const coolLocation = useCallback(() => {
    samplerRef.current?.stop()
    samplerRef.current = null
  }, [])

  /**
   * If the phone refused location, park the check-in on the "Turn on location" screen until it's
   * on (or the person checks in without it, where allowed, or backs out).
   */
  const ensureLocation = useCallback((sample: Promise<SampleResult>, action: 'in' | 'out'): Promise<SampleResult> =>
    sample.then((s) => {
      if (s.reading.status !== 'denied') {
        blockedRef.current = false
        if (s.reading.status === 'ok') markLocationWorked()
        return s
      }
      blockedRef.current = true
      return new Promise<SampleResult>((resolve, reject) => {
        helpRef.current = { resolve, reject }
        setHelpReady(false)
        setView({ name: 'location-off', mode: { kind: 'inflow', action } })
      })
    }), [])

  /** Explainer first (once), then the best reading; a refusal leads to the "Turn on location" steps. */
  const readLocation = useCallback((actionLabel: string, onSampling: () => void): Promise<SampleResult> => {
    const action = actionLabel === 'check out' ? 'out' : 'in'
    const fix = fixRef.current
    fixRef.current = null
    if (fix && Date.now() - fix.at < 45_000 && fix.sample.reading.status === 'ok' && fix.sample.reading.accuracy <= 25) {
      samplerRef.current?.stop()
      samplerRef.current = null
      onSampling()
      return Promise.resolve(fix.sample)
    }
    const running = samplerRef.current
    samplerRef.current = null
    if (running) {
      onSampling()
      return ensureLocation(running.result, action)
    }
    if (locationExplained()) {
      onSampling()
      return ensureLocation(startLocationSampler().result, action)
    }
    return ensureLocation(new Promise<SampleResult>((resolve) => {
      explainRef.current = resolve
      setView({ name: 'explain', actionLabel })
    }), action)
  }, [ensureLocation])

  const onExplainAllow = () => {
    markLocationExplained()
    const resolve = explainRef.current
    explainRef.current = null
    setView({ name: 'working' })
    if (resolve) startLocationSampler().result.then(resolve)
  }

  /** "Try again" on the Turn-on-location screen (also run by itself when location comes back). */
  const retryLocation = async (mode: HelpMode): Promise<boolean> => {
    const sample = await startLocationSampler().result
    if (sample.reading.status === 'denied') {
      blockedRef.current = true
      return false
    }
    blockedRef.current = false
    markLocationExplained()
    if (mode.kind === 'inflow') {
      const waiting = helpRef.current
      helpRef.current = null
      if (!waiting) return true
      setView({ name: 'working' })
      waiting.resolve(sample)
      return true
    }
    if (sample.reading.status === 'ok') fixRef.current = { sample, at: Date.now() }
    if (mode.kind === 'preflight') setHelpReady(true)
    else setView({ name: 'home' })
    return true
  }

  /** Leave the Turn-on-location screen without location: check in flagged, or back out. */
  const leaveLocationHelp = (mode: HelpMode, how: 'without' | 'back') => {
    if (mode.kind === 'inflow') {
      const waiting = helpRef.current
      helpRef.current = null
      setView({ name: 'working' })
      if (how === 'without') waiting?.resolve(DENIED_SAMPLE)
      else waiting?.reject(new LocationCancelled())
      return
    }
    if (mode.kind === 'preflight' && how === 'without') {
      const action = mode.action === 'in' ? 'check_in' : 'check_out'
      if (mode.viaFaceId) runPasskeyAction(action, { withoutLocation: true })
      else runFallbackAction(action, undefined, { withoutLocation: true })
      return
    }
    setView({ name: 'home' })
  }

  /** Slid while location is known to be off: show the steps first, before Face ID or anything else. */
  const preflightBlocked = (action: 'check_in' | 'check_out', viaFaceId: boolean) => {
    if (!blockedRef.current) return false
    setHelpReady(false)
    setHomeNotice(null)
    setView({ name: 'location-off', mode: { kind: 'preflight', action: action === 'check_in' ? 'in' : 'out', viaFaceId } })
    return true
  }

  /** A reading just arrived: put the dot on the working screen's map. */
  const showDot = (sample: SampleResult | null) => {
    const position = fixOf(sample)
    if (position) setWork((w) => (w ? { ...w, position } : w))
    return !!position && !!area
  }

  const stagesFor = (withIdentity: boolean, withLocation: boolean): WorkStage[] => [
    ...(withIdentity ? [{ key: 'id', label: `Confirming with ${unlock.name}` }] : []),
    ...(withLocation ? [{ key: 'loc', label: 'Checking you’re in the department' }] : []),
    { key: 'save', label: 'Saving' },
  ]
  const advance = (key: string) => setWork((w) => (w ? { ...w, current: Math.max(w.current, w.stages.findIndex((s) => s.key === key)) } : w))

  const showResult = (r: Omit<ResultState, 'undoUntil'> & { undoable: boolean }) => {
    setResultState({ ...r, undoUntil: r.undoable ? Date.now() + UNDO_WINDOW_MS : null })
    setUndoBusy(false)
    setView({ name: 'result' })
  }

  // Return home once the undo window has passed.
  useEffect(() => {
    if (view.name !== 'result' || !resultState?.undoUntil) return
    const ms = resultState.undoUntil - Date.now()
    const id = window.setTimeout(() => setView({ name: 'home' }), Math.max(0, ms) + 600)
    return () => window.clearTimeout(id)
  }, [view.name, resultState?.undoUntil])

  // ── Passkey-signed attendance ───────────────────────────────────────────────
  /** Must be called synchronously from the gesture: it opens the Face ID sheet straight away. */
  const runPasskeyAction = (action: 'check_in' | 'check_out' | 'undo', opts: { withoutLocation?: boolean } = {}) => {
    const t = tokenRef.current
    if (!t) return goScan()
    const wantsLocation = action !== 'undo' && locationCheck
    if (wantsLocation && !opts.withoutLocation && preflightBlocked(action, true)) return
    const title = action === 'check_in' ? 'Checking you in' : action === 'check_out' ? 'Checking you out' : 'Undoing'
    const assertion = assert(takeAuth())
    if (action === 'undo') {
      setUndoBusy(true)
    } else {
      setWork({ title, stages: stagesFor(true, wantsLocation), current: 0 })
      setView({ name: 'working' })
    }
    setHomeNotice(null)

    void (async () => {
      let credentialId: string | undefined
      try {
        const response = await assertion
        credentialId = response.id
        let sample: SampleResult | null = null
        if (wantsLocation) {
          sample = opts.withoutLocation
            ? (advance('loc'), DENIED_SAMPLE)
            : await readLocation(action === 'check_in' ? 'check in' : 'check out', () => advance('loc'))
        }
        advance('save')
        const res = await afterDot(passkeyAction({ data: { token: t, response, action, ...(sample ? { location: sample.reading } : {}) } }), showDot(sample))
        adoptIdentity({ staffToken: res.staffToken, staff: res.staff, credentialStatus: res.credentialStatus }, res.status)
        if (res.result) {
          showResult({
            result: res.result,
            approximate: !!sample?.approximate && res.result.location !== 'inside',
            showInstall: false,
            undoable: action !== 'undo',
            via: 'passkey',
            position: fixOf(sample),
          })
        } else {
          setView({ name: 'home' })
        }
      } catch (e) {
        coolLocation()
        setUndoBusy(false)
        if (e instanceof LocationCancelled) {
          setHomeNotice({ tone: 'neutral', title: 'Cancelled', message: 'Nothing was recorded. Slide again once location is on.' })
          setView({ name: 'home' })
          return
        }
        if (e instanceof PasskeyError) {
          setHomeNotice(e.kind === 'cancelled'
            ? { tone: 'neutral', title: 'Cancelled', message: 'Nothing was recorded. Slide again when you’re ready.' }
            : { tone: 'warning', title: `${capitalise(unlock.name)} didn’t work`, message: `${e.message} You can also check in without it from the menu.` })
          if (action !== 'undo') setView({ name: 'home' })
          return
        }
        const err = classifyServerError(e, online())
        if (routeError(err, credentialId)) return
        if (err.kind === 'already_in' || err.kind === 'not_in' || err.kind === 'nothing_to_undo') void refreshStatus()
        setHomeNotice({ tone: err.kind === 'network' ? 'danger' : 'warning', title: err.title, message: err.message })
        setView({ name: 'home' })
      } finally {
        prefetchAuth()
      }
    })()
  }

  const refreshStatus = async () => {
    const t = tokenRef.current
    const remembered = readRememberedStaff()
    if (!t || !remembered) return
    try {
      const res = await getStaffStatus({ data: { token: t, staffToken: remembered.staffToken } })
      if (res.staff) setStatus(res.status)
    } catch {
      // Keep what we have.
    }
  }

  // ── "You didn't check out" ─────────────────────────────────────────────────
  const checkForgotten = useCallback(async () => {
    const t = tokenRef.current
    const remembered = readRememberedStaff()
    if (!t || !remembered) return
    try {
      const res = await getForgottenCheckout({ data: { token: t, staffToken: remembered.staffToken } })
      const session = res.session
      if (session && !forgottenDismissed.current.has(session.id)) {
        setForgotten((f) => (f?.session.id === session.id ? f : { session, busy: false, notice: null, saved: null }))
      }
    } catch {
      // Not essential: the coordinator still sees the open shift.
    }
  }, [])

  // Ask once per visit, once Home knows the person's status (passkey phones only: saving needs Face ID).
  const homeReady = view.name === 'home' && passkeyMode && !!token && status !== null
  const staffKey = me ? `${me.staff.id}` : null
  useEffect(() => {
    if (!homeReady || !staffKey || forgottenChecked.current === staffKey) return
    forgottenChecked.current = staffKey
    void checkForgotten()
  }, [homeReady, staffKey, checkForgotten])

  // Back after a while (e.g. from a reminder notification): refresh what Home shows.
  const hiddenAt = useRef<number | null>(null)
  const homeReadyRef = useRef(homeReady)
  homeReadyRef.current = homeReady
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        return
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0
      hiddenAt.current = null
      if (away < 60_000 || !homeReadyRef.current) return
      void refreshStatus()
      void checkForgotten()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  })

  /** Must be called synchronously from the tap: it opens the Face ID sheet straight away. */
  const runReportForgotten = (leftAt: Date) => {
    const t = tokenRef.current
    const current = forgotten
    if (!t || !current || current.busy) return
    const assertion = assert(takeAuth())
    setForgotten({ ...current, busy: true, notice: null })
    void (async () => {
      let credentialId: string | undefined
      try {
        const response = await assertion
        credentialId = response.id
        const res = await reportForgottenCheckout({ data: { token: t, response, sessionId: current.session.id, leftAt: leftAt.toISOString() } })
        const next = { staffToken: res.staffToken, staff: res.staff, credentialStatus: res.credentialStatus }
        rememberStaff(next)
        setMe(next)
        forgottenDismissed.current.add(current.session.id)
        setForgotten({ ...current, busy: false, notice: null, saved: { at: res.checkOutAt } })
        void refreshStatus()
      } catch (e) {
        if (e instanceof PasskeyError) {
          setForgotten({
            ...current,
            busy: false,
            notice: e.kind === 'cancelled'
              ? { tone: 'neutral', title: 'Cancelled', message: `Nothing was saved. Choose a time and confirm with ${unlock.name} when you’re ready.` }
              : { tone: 'warning', title: `${capitalise(unlock.name)} didn’t work`, message: e.message },
          })
          return
        }
        const err = classifyServerError(e, online())
        if (routeError(err, credentialId)) {
          setForgotten(null)
          return
        }
        if (/already checked out|couldn't be found|couldn’t be found/i.test(err.message)) {
          forgottenDismissed.current.add(current.session.id)
          setForgotten(null)
          setHomeNotice({ tone: 'neutral', title: 'Already closed', message: 'That shift has already been checked out. Nothing else to do.' })
          void refreshStatus()
          return
        }
        const timeProblem = /time|hasn’t happened|hasn't happened|24 hours/i.test(err.message) && err.kind === 'other'
        setForgotten({
          ...current,
          busy: false,
          notice: { tone: 'warning', title: timeProblem ? 'Check the time' : err.title, message: err.message },
        })
      } finally {
        prefetchAuth()
      }
    })()
  }

  const toggleReminders = () => {
    if (reminders.menu?.on) {
      void reminders.disable().then(() => setHomeNotice({ tone: 'neutral', title: 'Reminders are off', message: 'Turn them back on any time from this menu.' }))
    } else {
      setHomeNotice(null)
      reminders.enable()
    }
  }

  // ── Identify ("I've used InOut on this phone before") ──────────────────────
  const runIdentify = () => {
    const t = tokenRef.current
    if (!t) return goScan()
    setWelcomeNotice(null)
    setIdentifyBusy(true)
    const assertion = assert(takeAuth())
    void (async () => {
      let credentialId: string | undefined
      try {
        const response = await assertion
        credentialId = response.id
        const res = await passkeyAction({ data: { token: t, response, action: 'identify' } })
        adoptIdentity({ staffToken: res.staffToken, staff: res.staff, credentialStatus: res.credentialStatus }, res.status)
        setHomeNotice(null)
        setView({ name: 'home' })
      } catch (e) {
        if (e instanceof PasskeyError) {
          setWelcomeNotice(e.kind === 'cancelled'
            ? { tone: 'neutral', title: 'Looks like this phone isn’t set up yet', message: 'No InOut passkey was used. If this is your first time, set up this phone below.' }
            : { tone: 'warning', title: `${capitalise(unlock.name)} didn’t work`, message: e.message })
        } else {
          const err = classifyServerError(e, online())
          if (!routeError(err, credentialId)) setWelcomeNotice({ tone: 'warning', title: err.title, message: err.message })
        }
        setView({ name: 'welcome' })
      } finally {
        setIdentifyBusy(false)
        prefetchAuth()
      }
    })()
  }

  // ── Sign-up ─────────────────────────────────────────────────────────────────
  const startEnrolFetch = (p: Person) => {
    const t = tokenRef.current ?? ''
    const payload = p.kind === 'entry'
      ? { token: t, rosterEntryId: p.entry.id }
      : { token: t, name: p.name, ...(p.role ? { role: p.role } : {}) }
    const pending = { ...track(beginEnrolment({ data: payload })), person: p }
    enrolRef.current = pending
    return pending
  }

  const confirmPerson = () => {
    if (!confirming) return
    const { person: p, purpose } = confirming
    setConfirming(null)
    if (purpose === 'fallback') {
      if (p.kind !== 'entry') return
      setFallbackFlag(true)
      rememberRosterEntry(p.entry.id)
      storeFallbackEntry(p.entry)
      setFallbackEntry(p.entry)
      setFallbackStatus(null)
      setHomeNotice(null)
      if (me) setForceFallback(true)
      setView({ name: 'home' })
      getStatus({ data: { rosterEntryId: p.entry.id } }).then(setFallbackStatus, () => setFallbackStatus({ checkedIn: false, checkInAt: null }))
      return
    }
    setPerson(p)
    setSetupProblem(null)
    setCheckInNow(true)
    startEnrolFetch(p)
    setView({ name: 'passkey' })
  }

  const runSetUp = () => {
    if (!person) return
    let pending = enrolRef.current
    if (!pending || pending.person !== person || pending.error || Date.now() - pending.at > ENROL_FRESH_MS) {
      pending = startEnrolFetch(person)
    }
    setSetupBusy(true)
    setSetupProblem(null)
    const registration: Promise<RegistrationResponseJSON> = pending.value
      ? createPasskey(pending.value.optionsJSON)
      : pending.promise.then((o) => createPasskey(o.optionsJSON))
    const wantsLocation = checkInNow && locationCheck
    // Location permission already given: start reading alongside the passkey prompt.
    if (wantsLocation && locationExplained()) warmLocation()

    void (async () => {
      let response: RegistrationResponseJSON
      try {
        response = await registration
      } catch (e) {
        coolLocation()
        setSetupBusy(false)
        if (e instanceof PasskeyError) {
          setSetupProblem({ kind: e.kind })
          return
        }
        const err = classifyServerError(e, online())
        enrolRef.current = null
        if (!routeError(err)) setSetupProblem({ kind: 'server', title: err.title, message: err.message })
        return
      }
      enrolRef.current = null
      setWork({ title: checkInNow ? 'Checking you in' : 'Setting up your phone', stages: stagesFor(false, wantsLocation), current: 0 })
      setView({ name: 'working' })
      try {
        let sample: SampleResult | null = null
        // Backing out of "Turn on location" still finishes setting up the phone, without checking in.
        let skipCheckIn = false
        if (wantsLocation) {
          try {
            sample = await readLocation('check in', () => advance('loc'))
          } catch (e) {
            if (!(e instanceof LocationCancelled)) throw e
            skipCheckIn = true
          }
        }
        advance('save')
        const res = await afterDot(finishEnrolment({
          data: {
            token: tokenRef.current ?? '',
            response,
            ...(checkInNow && !skipCheckIn ? { checkIn: sample ? { location: sample.reading } : {} } : {}),
          },
        }), showDot(sample))
        adoptIdentity({ staffToken: res.staffToken, staff: res.staff, credentialStatus: 'pending' }, res.status)
        setSetupBusy(false)
        prefetchAuth()
        showResult({
          result: res.session ?? null,
          enrolledOnly: res.session ? undefined : { alreadyIn: res.status.checkedIn },
          approximate: !!sample?.approximate && res.session?.location !== 'inside',
          showInstall: true,
          undoable: !!res.session,
          via: 'passkey',
          position: fixOf(sample),
        })
      } catch (e) {
        // The phone saved a passkey the server never accepted: ask the provider to forget it.
        signalUnknownPasskey(response.id)
        setSetupBusy(false)
        const err = classifyServerError(e, online())
        if (routeError(err)) return
        setSetupProblem({ kind: 'server', title: err.title, message: `${err.message}` })
        setView({ name: 'passkey' })
      }
    })()
  }

  // ── Without Face ID (name picked) ──────────────────────────────────────────
  const runFallbackAction = (action: 'check_in' | 'check_out' | 'undo', locum?: { name: string; role: string }, opts: { withoutLocation?: boolean } = {}) => {
    const t = tokenRef.current
    if (!t) return goScan()
    const entry = fallbackEntry
    if (!locum && !entry) return
    const wantsLocation = action !== 'undo' && locationCheck
    if (wantsLocation && !opts.withoutLocation && !locum && preflightBlocked(action, false)) return
    if (action === 'undo') {
      setUndoBusy(true)
    } else {
      setWork({ title: action === 'check_in' ? 'Checking you in' : 'Checking you out', stages: stagesFor(false, wantsLocation), current: 0 })
      setView({ name: 'working' })
    }
    setHomeNotice(null)
    void (async () => {
      try {
        let sample: SampleResult | null = null
        if (wantsLocation) {
          sample = opts.withoutLocation
            ? (advance('loc'), DENIED_SAMPLE)
            : await readLocation(action === 'check_out' ? 'check out' : 'check in', () => advance('loc'))
        }
        advance('save')
        const dot = showDot(sample)
        const location: LocationReading | undefined = sample?.reading
        let result: ActionResult
        let entryId = entry?.id ?? 0
        if (locum) {
          const res = await manualCheckIn({ data: { token: t, name: locum.name, ...(locum.role ? { role: locum.role } : {}), ...(location ? { location } : {}) } })
          result = res.result
          entryId = res.entryId
          const added: RosterEntry = { id: res.entryId, name: locum.name, role: locum.role || null, shiftStart: null, shiftEnd: null, source: 'manual' }
          setFallbackFlag(true)
          rememberRosterEntry(res.entryId)
          storeFallbackEntry(added)
          setFallbackEntry(added)
          if (me) setForceFallback(true)
        } else if (action === 'undo') {
          const res = await undoLastAction({ data: { token: t, rosterEntryId: entryId } })
          result = { action: res.action, at: new Date().toISOString(), identity: 'self_selected', location: 'not_requested', verified: false, reasons: [] }
        } else {
          const fn = action === 'check_in' ? checkIn : checkOut
          const res = await fn({ data: { token: t, rosterEntryId: entryId, ...(location ? { location } : {}) } })
          result = res.result
        }
        const s = await afterDot(getStatus({ data: { rosterEntryId: entryId } }).catch(() => null), dot)
        if (s) setFallbackStatus(s)
        showResult({
          result,
          approximate: !!sample?.approximate && result.location !== 'inside',
          showInstall: false,
          undoable: action !== 'undo',
          via: 'fallback',
          position: fixOf(sample),
        })
      } catch (e) {
        setUndoBusy(false)
        if (e instanceof LocationCancelled) {
          setHomeNotice({ tone: 'neutral', title: 'Cancelled', message: 'Nothing was recorded. Slide again once location is on.' })
          setView(locum ? { name: 'locum', purpose: 'fallback' } : { name: 'home' })
          return
        }
        const err = classifyServerError(e, online())
        if (routeError(err)) return
        setHomeNotice({ tone: err.kind === 'network' ? 'danger' : 'warning', title: err.title, message: err.message })
        if (locum) setView({ name: 'locum', purpose: 'fallback' })
        else setView({ name: 'home' })
        if (entry) getStatus({ data: { rosterEntryId: entry.id } }).then(setFallbackStatus, () => {})
      }
    })()
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const fallbackMode = (!me || forceFallback) && !!fallbackEntry
  const myEntry = useMemo(() => {
    const id = fallbackMode ? fallbackEntry?.id : status?.rosterEntryId
    return id ? entries.find((e) => e.id === id) ?? null : null
  }, [entries, fallbackEntry, fallbackMode, status?.rosterEntryId])
  const dateLabel = rota
    ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${rota.date}T12:00:00Z`))
    : ''
  const enrolSteps = ['You', capitalise(unlock.name), ...(locationCheck && checkInNow ? ['Location'] : [])]

  // ── Render ──────────────────────────────────────────────────────────────────
  const identityMenu = me && !fallbackMode ? (
    <IdentityMenu
      name={me.staff.name}
      role={me.staff.role}
      pending={me.credentialStatus === 'pending'}
      historyToken={token && status?.rosterEntryId ? token : null}
      onWithout={() => {
        // Name-picked check-in for this person's own rota entry, if they have one today.
        const entry = status?.rosterEntryId ? entries.find((e) => e.id === status.rosterEntryId) : undefined
        if (entry) {
          setConfirming({ person: { kind: 'entry', entry }, purpose: 'fallback' })
        } else {
          setView({ name: 'who', purpose: 'fallback' })
        }
      }}
      withoutLabel={`Check in without ${unlock.name}`}
      onSignOut={signOut}
      reminders={reminders.menu
        ? { ...reminders.menu, needsInstall: reminders.needsInstall, onToggle: reminders.needsInstall ? () => setGuideOpen(true) : toggleReminders }
        : null}
    />
  ) : fallbackMode && fallbackEntry ? (
    <IdentityMenu
      name={fallbackEntry.name}
      role={fallbackEntry.role}
      pending={false}
      historyToken={token}
      onWithout={me ? () => {
        // Back to this phone's passkey.
        setFallbackFlag(false)
        setFallbackEntry(null)
        setForceFallback(false)
        setHomeNotice(null)
        setView({ name: 'home' })
      } : supported ? () => {
        setFallbackFlag(false)
        setFallbackEntry(null)
        setConfirming({ person: { kind: 'entry', entry: fallbackEntry }, purpose: 'enrol' })
        setView({ name: 'welcome' })
      } : undefined}
      withoutLabel={me ? `Use ${unlock.name} again` : `Set up ${unlock.name} instead`}
      onSignOut={signOut}
    />
  ) : null

  let body: React.ReactNode
  let left: React.ReactNode = null
  let right: React.ReactNode = null

  switch (view.name) {
    case 'boot':
      body = (
        <div className="flex flex-1 items-center justify-center pb-24" aria-busy="true">
          <div className="animate-reveal opacity-60 [animation-delay:250ms]"><RunnerMark size={56} animate="idle" /></div>
          <span className="sr-only">Loading</span>
        </div>
      )
      break

    case 'no-rota':
      body = (
        <div className="ck-screen flex flex-1 flex-col items-center justify-center pb-24 text-center">
          <RunnerMark size={84} animate="idle" tone="ink" />
          <h1 className="mt-6 text-[1.5rem] font-semibold tracking-[-0.02em] text-ink">No rota for today yet</h1>
          <p className="mt-2 max-w-[18rem] text-[0.9375rem] leading-relaxed text-muted text-pretty">
            Check-in opens once today’s rota is ready. Ask the coordinator, then scan the QR code again.
          </p>
        </div>
      )
      break

    case 'scan':
      body = (
        <ScanScreen
          greetingName={me ? me.staff.name.split(/\s+/)[0] : null}
          notice={view.notice}
          onToken={(t) => void enterWithToken(t)}
        />
      )
      right = identityMenu
      break

    case 'welcome':
      left = <span aria-hidden="true" />
      body = (
        <WelcomeScreen
          platform={platform}
          supported={supported}
          busy={identifyBusy}
          notice={welcomeNotice}
          dateLabel={dateLabel}
          onIdentify={runIdentify}
          onSignUp={() => {
            setWelcomeNotice(null)
            setView({ name: 'who', purpose: 'enrol' })
          }}
          onWithout={() => setView({ name: 'who', purpose: 'fallback' })}
        />
      )
      break

    case 'who':
      left = (
        <>
          <BackButton onClick={() => setView(me || fallbackEntry ? { name: 'home' } : { name: 'welcome' })} />
          {view.purpose === 'enrol' ? <StepProgress steps={enrolSteps} current={0} /> : null}
        </>
      )
      body = (
        <RosterPicker
          entries={entries}
          title={view.purpose === 'enrol' ? 'Who are you?' : 'Choose your name'}
          sub={view.purpose === 'enrol' ? 'Find your name on today’s rota.' : `Checking in without ${unlock.name}. Only choose your own name.`}
          onPick={(entry) => setConfirming({ person: { kind: 'entry', entry }, purpose: view.purpose })}
          onLocum={() => setView({ name: 'locum', purpose: view.purpose })}
        />
      )
      break

    case 'locum':
      left = (
        <>
          <BackButton onClick={() => setView({ name: 'who', purpose: view.purpose })} />
          {view.purpose === 'enrol' ? <StepProgress steps={enrolSteps} current={0} /> : null}
        </>
      )
      body = (
        <>
          {homeNotice && view.purpose === 'fallback' ? <Notice tone="warning" role="alert" title={homeNotice.title} className="mb-4">{homeNotice.message}</Notice> : null}
          <LocumForm
            entries={entries}
            submitLabel={view.purpose === 'enrol' ? 'Continue' : 'Check in'}
            onPickExisting={(entry) => setConfirming({ person: { kind: 'entry', entry }, purpose: view.purpose })}
            onSubmit={(p) => {
              if (view.purpose === 'enrol') setConfirming({ person: { kind: 'locum', ...p }, purpose: 'enrol' })
              else runFallbackAction('check_in', p)
            }}
          />
        </>
      )
      break

    case 'passkey':
      left = (
        <>
          <BackButton onClick={() => { cancelPasskeyCeremony(); setSetupBusy(false); setView({ name: 'who', purpose: 'enrol' }) }} />
          <StepProgress steps={enrolSteps} current={1} />
        </>
      )
      body = person ? (
        <PasskeySetupScreen
          platform={platform}
          name={personName(person)}
          role={personRole(person)}
          checkInNow={checkInNow}
          onCheckInNow={setCheckInNow}
          busy={setupBusy}
          problem={setupProblem}
          onSetUp={runSetUp}
          onChangePerson={() => { cancelPasskeyCeremony(); setSetupBusy(false); setView({ name: 'who', purpose: 'enrol' }) }}
          onIdentify={() => { setView({ name: 'welcome' }); runIdentify() }}
          onWithout={() => {
            if (person.kind === 'entry') {
              setConfirming({ person, purpose: 'fallback' })
            } else {
              setView({ name: 'locum', purpose: 'fallback' })
            }
          }}
        />
      ) : null
      break

    case 'explain':
      if (work && person && !me) {
        left = <StepProgress steps={enrolSteps} current={2} />
      }
      body = <LocationExplainer actionLabel={view.actionLabel} area={area} onAllow={onExplainAllow} />
      break

    case 'location-off': {
      const mode = view.mode
      left = <BackButton label={mode.kind === 'inflow' ? 'Cancel' : 'Back'} onClick={() => leaveLocationHelp(mode, 'back')} />
      body = (
        <LocationHelp
          key={mode.kind}
          platform={platform}
          mode={mode}
          unlockName={unlock.name}
          permission={permission}
          ready={helpReady}
          onRetry={() => retryLocation(mode)}
          onContinue={() => {
            if (mode.kind !== 'preflight') return
            const action = mode.action === 'in' ? 'check_in' : 'check_out'
            if (mode.viaFaceId) runPasskeyAction(action)
            else runFallbackAction(action)
          }}
          onWithout={ALLOW_CHECKIN_WITHOUT_LOCATION && mode.kind !== 'help' ? () => leaveLocationHelp(mode, 'without') : undefined}
          openInBrowserHref={platform === 'ios' && isStandalone() && token ? `/?token=${token}` : undefined}
        />
      )
      break
    }

    case 'working':
      body = work ? <WorkingScreen {...work} area={locationCheck ? area : null} /> : null
      break

    case 'result': {
      const rs = resultState
      const name = me?.staff.name ?? fallbackEntry?.name ?? ''
      body = rs ? (
        <ResultScreen
          result={rs.result}
          enrolledOnly={rs.enrolledOnly}
          name={name}
          platform={platform}
          locationCheck={locationCheck}
          pending={rs.via === 'passkey' && me?.credentialStatus === 'pending'}
          approximate={rs.approximate}
          showInstall={rs.showInstall}
          area={area}
          position={rs.position}
          onTurnOn={() => setView({ name: 'location-off', mode: { kind: 'help' } })}
          undo={rs.undoUntil && rs.result
            ? {
                until: rs.undoUntil,
                busy: undoBusy,
                viaFaceId: rs.via === 'passkey',
                onUndo: () => (rs.via === 'passkey' ? runPasskeyAction('undo') : runFallbackAction('undo')),
              }
            : null}
          onDone={() => setView({ name: 'home' })}
          // Right after setting up the phone, the Home Screen steps come first; reminders are offered on Home.
          reminder={rs.via === 'passkey' && rs.result?.action === 'check_in' && !rs.showInstall
            ? <ReminderCard reminders={reminders} platform={platform} shiftEnd={myEntry?.shiftEnd?.slice(0, 5) ?? null} />
            : null}
          installReminders={rs.via === 'passkey' && rs.result?.action === 'check_in' && reminders.needsInstall}
        />
      ) : null
      right = identityMenu
      break
    }

    case 'home': {
      const name = me?.staff.name ?? fallbackEntry?.name ?? ''
      const homeStatus = fallbackMode ? fallbackStatus : status
      if (forgotten && passkeyMode) {
        const f = forgotten
        body = (
          <ForgottenScreen
            key={f.session.id}
            session={f.session}
            platform={platform}
            busy={f.busy}
            notice={f.notice}
            saved={f.saved}
            onReport={runReportForgotten}
            onStillHere={f.session.canCheckOutNow && !f.saved ? () => {
              forgottenDismissed.current.add(f.session.id)
              setForgotten(null)
            } : undefined}
            onDone={() => {
              setForgotten(null)
              // Another, older open shift may be waiting.
              void checkForgotten()
            }}
          />
        )
        right = identityMenu
        break
      }
      body = (
        <HomeScreen
          name={name}
          status={homeStatus}
          shift={myEntry ? shiftLabel(myEntry.shiftStart, myEntry.shiftEnd) : null}
          platform={platform}
          locationCheck={locationCheck}
          viaFaceId={!fallbackMode}
          notice={homeNotice ? (
            <Notice
              tone={homeNotice.tone}
              role="alert"
              title={homeNotice.title}
              action={homeNotice.tone === 'danger' && homeStatus === null && token
                ? <TextLink className="-ml-3" onClick={() => void enterWithToken(token)}>Try again</TextLink>
                : undefined}
            >
              {homeNotice.message}
            </Notice>
          ) : null}
          location={locationCheck ? (
            <LocationStatus
              token={token}
              platform={platform}
              area={area}
              permission={permission}
              onFix={onFix}
              onArea={setPreviewArea}
              onBlocked={onBlocked}
              onTurnOn={() => setView({ name: 'location-off', mode: { kind: 'help' } })}
            />
          ) : null}
          onArm={warmLocation}
          onDisarm={coolLocation}
          onSlide={(mode) => {
            const action = mode === 'in' ? 'check_in' : 'check_out'
            if (fallbackMode) runFallbackAction(action)
            else runPasskeyAction(action)
          }}
          reminder={!fallbackMode ? <ReminderCard reminders={reminders} platform={platform} shiftEnd={myEntry?.shiftEnd?.slice(0, 5) ?? null} /> : null}
          installReminders={!fallbackMode && reminders.needsInstall}
        />
      )
      right = identityMenu
      break
    }
  }

  return (
    <Shell left={left} right={right} wide={view.name === 'home' || view.name === 'explain' || view.name === 'location-off' || view.name === 'working' || view.name === 'result'}>
      {body}
      <ConfirmPersonSheet
        person={confirming?.person ?? null}
        mode={confirming?.purpose ?? 'enrol'}
        onConfirm={confirmPerson}
        onCancel={() => setConfirming(null)}
      />
      {reminders.needsInstall ? (
        <InstallGuide open={guideOpen} onOpenChange={setGuideOpen} onSnooze={() => snoozeInstallCard()} />
      ) : null}
    </Shell>
  )
}
