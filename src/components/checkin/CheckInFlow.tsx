import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { RunnerMark } from '#/components/brand/RunnerMark'
import { beginEnrolment, beginPasskeyAuth, finishEnrolment, getStaffStatus, passkeyAction } from '#/utils/passkeys.functions'
import type { ActionResult, StaffStatus } from '#/utils/passkeys.functions'
import { checkIn, checkOut, getStatus, manualCheckIn, undoLastAction } from '#/utils/sessions.functions'
import type { LocationReading } from '#/utils/location'
import { classifyServerError, type CheckinError } from '#/lib/checkinErrors'
import {
  clearStoredToken,
  forgetStaff,
  locationExplained,
  markLocationExplained,
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
import { currentPlatform, unlockCopy, type Platform } from '#/lib/platform'
import { isValidToken } from '#/lib/qrScanner'
import { capitalise, shiftLabel } from './copy'
import { HomeScreen, IdentityMenu } from './HomeScreen'
import { LocationExplainer } from './LocationExplainer'
import { ConfirmPersonSheet, LocumForm, personName, personRole, type Person } from './LocumForm'
import { PasskeySetupScreen, type SetupProblem } from './PasskeySetupScreen'
import { ResultScreen, UNDO_WINDOW_MS, type ShownResult } from './ResultScreen'
import { RosterPicker, type RosterEntry } from './RosterPicker'
import { ScanScreen } from './ScanScreen'
import { BackButton, Notice, Shell, StepProgress, TextLink } from './ui'
import { WelcomeScreen, type WelcomeNotice } from './WelcomeScreen'
import { WorkingScreen, type WorkStage } from './WorkingScreen'

export type RosterData = {
  rota: { id: number; date: string } | null
  locationCheck: boolean
  entries: RosterEntry[]
}

type Purpose = 'enrol' | 'fallback'
type Work = { title: string; stages: WorkStage[]; current: number }
type HomeNoticeData = { tone: 'neutral' | 'warning' | 'danger'; title: string; message: string } | null
type ResultState = {
  result: ShownResult | null
  enrolledOnly?: { alreadyIn: boolean }
  approximate: boolean
  showInstall: boolean
  undoUntil: number | null
  via: 'passkey' | 'fallback'
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
  | { name: 'working' }
  | { name: 'result' }
  | { name: 'home' }

const FALLBACK_KEY = 'inout-fallback-mode'
const ENROL_FRESH_MS = 4 * 60 * 1000

function setFallbackFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(FALLBACK_KEY, '1')
    else localStorage.removeItem(FALLBACK_KEY)
  } catch {
    // Storage unavailable.
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
  const explainRef = useRef<((r: SampleResult) => void) | null>(null)
  const tokenRef = useRef<string | null>(null)
  tokenRef.current = token

  const unlock = unlockCopy(platform)

  // Each step starts at the top (the heading also takes focus).
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [view.name])

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
  }, [])

  const signOut = useCallback(() => {
    cancelPasskeyCeremony()
    forgetStaff()
    setFallbackFlag(false)
    setMe(null)
    setStatus(null)
    setFallbackEntry(null)
    setFallbackStatus(null)
    setHomeNotice(null)
    setWelcomeNotice({ tone: 'neutral', title: 'Removed from this phone', message: 'Your passkey is still saved on the phone. Sign in again any time.' })
    setView({ name: 'welcome' })
  }, [])

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
    const fallbackPick = fallbackFlag() && savedEntry ? entries.find((e) => e.id === savedEntry) : undefined
    if (fallbackPick) {
      setFallbackEntry(fallbackPick)
      setFallbackStatus(null)
      setView({ name: 'home' })
      getStatus({ data: { rosterEntryId: fallbackPick.id } }).then(setFallbackStatus, () => setFallbackStatus({ checkedIn: false, checkInAt: null }))
      return
    }

    // Unknown phone: check the QR is today's before asking anyone to sign up.
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

  /** Explainer first (once), then the best reading. */
  const readLocation = useCallback((actionLabel: string, onSampling: () => void): Promise<SampleResult> => {
    const running = samplerRef.current
    samplerRef.current = null
    if (running) {
      onSampling()
      return running.result
    }
    if (locationExplained()) {
      onSampling()
      return startLocationSampler().result
    }
    return new Promise<SampleResult>((resolve) => {
      explainRef.current = resolve
      setView({ name: 'explain', actionLabel })
    })
  }, [])

  const onExplainAllow = () => {
    markLocationExplained()
    const resolve = explainRef.current
    explainRef.current = null
    setView({ name: 'working' })
    if (resolve) startLocationSampler().result.then(resolve)
  }
  const onExplainSkip = () => {
    markLocationExplained()
    const resolve = explainRef.current
    explainRef.current = null
    setView({ name: 'working' })
    resolve?.({ reading: { status: 'denied' }, approximate: false })
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
  const runPasskeyAction = (action: 'check_in' | 'check_out' | 'undo') => {
    const t = tokenRef.current
    if (!t) return goScan()
    const wantsLocation = action !== 'undo' && locationCheck
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
          sample = await readLocation(action === 'check_in' ? 'check in' : 'check out', () => advance('loc'))
        }
        advance('save')
        const res = await passkeyAction({ data: { token: t, response, action, ...(sample ? { location: sample.reading } : {}) } })
        adoptIdentity({ staffToken: res.staffToken, staff: res.staff, credentialStatus: res.credentialStatus }, res.status)
        if (res.result) {
          showResult({
            result: res.result,
            approximate: !!sample?.approximate && res.result.location !== 'inside',
            showInstall: false,
            undoable: action !== 'undo',
            via: 'passkey',
          })
        } else {
          setView({ name: 'home' })
        }
      } catch (e) {
        coolLocation()
        setUndoBusy(false)
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
      setFallbackEntry(p.entry)
      setFallbackStatus(null)
      setHomeNotice(null)
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
        if (wantsLocation) sample = await readLocation('check in', () => advance('loc'))
        advance('save')
        const res = await finishEnrolment({
          data: {
            token: tokenRef.current ?? '',
            response,
            ...(checkInNow ? { checkIn: sample ? { location: sample.reading } : {} } : {}),
          },
        })
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
  const runFallbackAction = (action: 'check_in' | 'check_out' | 'undo', locum?: { name: string; role: string }) => {
    const t = tokenRef.current
    if (!t) return goScan()
    const entry = fallbackEntry
    if (!locum && !entry) return
    const wantsLocation = action !== 'undo' && locationCheck
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
        if (wantsLocation) sample = await readLocation(action === 'check_out' ? 'check out' : 'check in', () => advance('loc'))
        advance('save')
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
          setFallbackEntry(added)
        } else if (action === 'undo') {
          const res = await undoLastAction({ data: { token: t, rosterEntryId: entryId } })
          result = { action: res.action, at: new Date().toISOString(), identity: 'self_selected', location: 'not_requested', verified: false, reasons: [] }
        } else {
          const fn = action === 'check_in' ? checkIn : checkOut
          const res = await fn({ data: { token: t, rosterEntryId: entryId, ...(location ? { location } : {}) } })
          result = res.result
        }
        const s = await getStatus({ data: { rosterEntryId: entryId } }).catch(() => null)
        if (s) setFallbackStatus(s)
        showResult({
          result,
          approximate: !!sample?.approximate && result.location !== 'inside',
          showInstall: false,
          undoable: action !== 'undo',
          via: 'fallback',
        })
      } catch (e) {
        setUndoBusy(false)
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
  const fallbackMode = !me && !!fallbackEntry
  const myEntry = useMemo(() => {
    const id = fallbackMode ? fallbackEntry?.id : status?.rosterEntryId
    return id ? entries.find((e) => e.id === id) ?? null : null
  }, [entries, fallbackEntry, fallbackMode, status?.rosterEntryId])
  const dateLabel = rota
    ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${rota.date}T12:00:00Z`))
    : ''
  const enrolSteps = ['You', capitalise(unlock.name), ...(locationCheck && checkInNow ? ['Location'] : [])]

  // ── Render ──────────────────────────────────────────────────────────────────
  const identityMenu = me ? (
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
    />
  ) : fallbackMode && fallbackEntry ? (
    <IdentityMenu
      name={fallbackEntry.name}
      role={fallbackEntry.role}
      pending={false}
      historyToken={token}
      onWithout={supported ? () => {
        setFallbackFlag(false)
        setFallbackEntry(null)
        setConfirming({ person: { kind: 'entry', entry: fallbackEntry }, purpose: 'enrol' })
        setView({ name: 'welcome' })
      } : undefined}
      withoutLabel={`Set up ${unlock.name} instead`}
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
      body = <LocationExplainer actionLabel={view.actionLabel} onAllow={onExplainAllow} onSkip={onExplainSkip} />
      break

    case 'working':
      body = work ? <WorkingScreen {...work} /> : null
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
          undo={rs.undoUntil && rs.result
            ? {
                until: rs.undoUntil,
                busy: undoBusy,
                viaFaceId: rs.via === 'passkey',
                onUndo: () => (rs.via === 'passkey' ? runPasskeyAction('undo') : runFallbackAction('undo')),
              }
            : null}
          onDone={() => setView({ name: 'home' })}
        />
      ) : null
      right = identityMenu
      break
    }

    case 'home': {
      const name = me?.staff.name ?? fallbackEntry?.name ?? ''
      const homeStatus = fallbackMode ? fallbackStatus : status
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
          onArm={warmLocation}
          onDisarm={coolLocation}
          onSlide={(mode) => {
            const action = mode === 'in' ? 'check_in' : 'check_out'
            if (fallbackMode) runFallbackAction(action)
            else runPasskeyAction(action)
          }}
        />
      )
      right = identityMenu
      break
    }
  }

  return (
    <Shell left={left} right={right}>
      {body}
      <ConfirmPersonSheet
        person={confirming?.person ?? null}
        mode={confirming?.purpose ?? 'enrol'}
        onConfirm={confirmPerson}
        onCancel={() => setConfirming(null)}
      />
    </Shell>
  )
}
