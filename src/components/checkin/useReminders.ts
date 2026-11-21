import { useCallback, useEffect, useRef, useState } from 'react'
import { getPushConfig, subscribePush, unsubscribePush } from '#/utils/reminders.functions'
import { classifyServerError } from '#/lib/checkinErrors'
import type { Platform } from '#/lib/platform'
import {
  clearReminderSnooze,
  currentSubscription,
  pushAvailability,
  pushPermission,
  PushSetupError,
  readReminderChoice,
  reminderPrompt,
  reminderSnoozed,
  snoozeReminders,
  storeReminderChoice,
  subscribeToPush,
  subscriptionJSON,
  unsubscribeFromPush,
  type PushAvailability,
  type PushPermission,
  type ReminderChoice,
  type ReminderPrompt,
} from '#/lib/pushClient'

export type RemindersState = {
  /** Which card to show, if any. 'on' only right after turning reminders on in this visit. */
  card: 'offer' | 'denied' | 'on' | null
  /** iPhone browser tab: InOut must be on the Home Screen first. */
  needsInstall: boolean
  /** The menu switch; null when reminders can't be used on this phone. */
  menu: { on: boolean; busy: boolean } | null
  busy: boolean
  /** A short message after a failed attempt. */
  error: string | null
  /** Turn on, from a tap (asks for notification permission before anything is awaited). */
  enable: () => void
  disable: () => Promise<void>
  /** "Not now": hide the card for 7 days. */
  snooze: () => void
  /** Sign-out: drop this phone's subscription for the person leaving. */
  forget: (staffToken: string) => Promise<void>
  /** Hide the "Reminders are on" confirmation (e.g. when leaving the screen). */
  settle: () => void
}

/**
 * Shift-end reminders for the person signed in on this phone with a passkey. Client-only: every
 * browser read happens in effects, so the first render (and SSR) shows nothing.
 */
export function useReminders({ token, staffToken, staffId, platform, active }: {
  token: string | null
  staffToken: string | null
  staffId: number | null
  platform: Platform
  /** False in "without Face ID" mode or before the person is known: reminders need a passkey. */
  active: boolean
}): RemindersState {
  const [availability, setAvailability] = useState<PushAvailability>('no')
  const [config, setConfig] = useState<{ enabled: boolean; publicKey: string | null } | null>(null)
  const [permission, setPermission] = useState<PushPermission>('default')
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [choice, setChoice] = useState<ReminderChoice>(null)
  const [snoozed, setSnoozed] = useState(false)
  const [asked, setAsked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justOn, setJustOn] = useState(false)
  const resent = useRef<number | null>(null)

  useEffect(() => {
    setAvailability(pushAvailability(platform))
    setPermission(pushPermission())
  }, [platform])

  useEffect(() => {
    if (availability === 'no' || config) return
    let live = true
    getPushConfig().then((c) => live && setConfig(c), () => live && setConfig({ enabled: false, publicKey: null }))
    return () => { live = false }
  }, [availability, config])

  const usable = active && staffId !== null && !!config?.enabled && !!config.publicKey

  // Read this phone's state for this person, and re-send a live subscription: browsers rotate
  // them, and the server's copy is an idempotent upsert.
  useEffect(() => {
    if (!usable || staffId === null) return
    const stored = readReminderChoice(staffId)
    setChoice(stored)
    setSnoozed(reminderSnoozed())
    setPermission(pushPermission())
    if (availability !== 'yes') return
    let live = true
    void currentSubscription().then((sub) => {
      if (!live) return
      setSubscribed(!!sub)
      if (sub && stored === 'on' && pushPermission() === 'granted' && token && staffToken && resent.current !== staffId) {
        resent.current = staffId
        subscribePush({ data: { token, staffToken, subscription: subscriptionJSON(sub) } }).catch(() => {
          // Best effort: the next open tries again.
          resent.current = null
        })
      }
    })
    return () => { live = false }
  }, [usable, staffId, availability, token, staffToken])

  // Coming back from Settings: notifications may have been allowed (or blocked) meanwhile.
  useEffect(() => {
    if (!usable) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') setPermission(pushPermission())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [usable])

  const enable = useCallback(() => {
    if (!usable || !config?.publicKey || !token || !staffToken || staffId === null || busy) return
    const wasDenied = pushPermission() === 'denied'
    setAsked(true)
    setBusy(true)
    setError(null)
    clearReminderSnooze()
    setSnoozed(false)
    const pending = subscribeToPush(config.publicKey)
    void (async () => {
      try {
        const sub = await pending
        await subscribePush({ data: { token, staffToken, subscription: subscriptionJSON(sub) } })
        storeReminderChoice(staffId, 'on')
        setChoice('on')
        setSubscribed(true)
        setPermission('granted')
        setJustOn(true)
      } catch (e) {
        setPermission(pushPermission())
        if (e instanceof PushSetupError) {
          if (e.kind === 'dismissed') setError('Notifications weren’t allowed, so reminders are still off.')
          else if (e.kind === 'failed') setError(e.message)
          // 'denied': the card switches to the "how to allow them" help.
          else if (wasDenied) setError('Still blocked. Follow the steps above, then try again.')
        } else {
          const err = classifyServerError(e)
          setError(err.kind === 'other' ? err.message : `${err.title}. ${err.message.replace('Nothing was recorded. ', '')}`)
        }
      } finally {
        setBusy(false)
      }
    })()
  }, [busy, config?.publicKey, staffId, staffToken, token, usable])

  const disable = useCallback(async () => {
    if (staffId === null) return
    setBusy(true)
    setError(null)
    try {
      const sub = await currentSubscription()
      if (sub && token && staffToken) {
        await unsubscribePush({ data: { token, staffToken, endpoint: sub.endpoint } }).catch(() => {})
      }
      await sub?.unsubscribe().catch(() => false)
    } finally {
      storeReminderChoice(staffId, 'off')
      setChoice('off')
      setSubscribed(false)
      setJustOn(false)
      setAsked(false)
      setBusy(false)
    }
  }, [staffId, staffToken, token])

  const snooze = useCallback(() => {
    snoozeReminders()
    setSnoozed(true)
    setAsked(false)
    setJustOn(false)
    setError(null)
  }, [])

  const forget = useCallback(async (leavingToken: string) => {
    const sub = await currentSubscription()
    if (sub && token) await unsubscribePush({ data: { token, staffToken: leavingToken, endpoint: sub.endpoint } }).catch(() => {})
    await unsubscribeFromPush()
    storeReminderChoice(staffId ?? 0, null)
    setChoice(null)
    setSubscribed(false)
    setJustOn(false)
    setAsked(false)
    resent.current = null
  }, [staffId, token])

  const settle = useCallback(() => {
    setJustOn(false)
    setError(null)
  }, [])

  const prompt: ReminderPrompt = usable
    ? reminderPrompt({ availability, permission, subscribed, choice, snoozed, asked })
    : 'none'
  const card = justOn && prompt === 'on' ? 'on' : prompt === 'offer' || prompt === 'denied' ? prompt : null

  return {
    card,
    needsInstall: prompt === 'install',
    menu: usable && availability !== 'no' ? { on: prompt === 'on', busy } : null,
    busy,
    error,
    enable,
    disable,
    snooze,
    forget,
    settle,
  }
}
