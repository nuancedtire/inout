import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { TOUR_STEPS, TOUR_VERSION, type TourStep } from './steps'

const STORAGE_KEY = `inout-admin-tour-seen-v${TOUR_VERSION}`

function hasSeenTour() {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return true
  }
}

function markTourSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // localStorage unavailable (private browsing etc.) — tour will just auto-start again next time
  }
}

type TourContextValue = {
  active: boolean
  step: TourStep | null
  stepIndex: number
  totalSteps: number
  start: () => void
  next: () => void
  back: () => void
  skip: () => void
}

const TourContext = createContext<TourContextValue | null>(null)

export function useTour() {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used within TourProvider')
  return ctx
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const autoStartChecked = useRef(false)

  // Auto-start once, on first mount, if this browser hasn't seen the current tour version
  useEffect(() => {
    if (autoStartChecked.current) return
    autoStartChecked.current = true
    if (!hasSeenTour()) {
      setStepIndex(0)
      setActive(true)
    }
  }, [])

  const step = active ? (TOUR_STEPS[stepIndex] ?? null) : null

  // Keep the router on whatever page the current step needs
  useEffect(() => {
    if (!active || !step) return
    if (pathname !== step.path) {
      navigate({ to: step.path })
    }
  }, [active, step, pathname, navigate])

  const start = useCallback(() => {
    setStepIndex(0)
    setActive(true)
  }, [])

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i + 1 >= TOUR_STEPS.length) {
        markTourSeen()
        setActive(false)
        return i
      }
      return i + 1
    })
  }, [])

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1))
  }, [])

  const skip = useCallback(() => {
    markTourSeen()
    setActive(false)
  }, [])

  return (
    <TourContext.Provider
      value={{ active, step, stepIndex, totalSteps: TOUR_STEPS.length, start, next, back, skip }}
    >
      {children}
    </TourContext.Provider>
  )
}
