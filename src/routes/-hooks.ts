import { useCallback, useEffect, useState } from 'react'

const STAFF_ID_KEY = 'inout-staff-id'

function read(): string | null {
  try {
    return localStorage.getItem(STAFF_ID_KEY)
  } catch {
    return null
  }
}

function write(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(STAFF_ID_KEY)
    else localStorage.setItem(STAFF_ID_KEY, String(id))
  } catch {
    // Storage unavailable (private browsing): identity lasts for this page only.
  }
}

/**
 * Today's roster entry chosen on this browser (used by /history). The check-in page keeps the same
 * key pointed at the person's entry after a passkey sign-in, so history opens on the right name.
 * Reads happen after mount only, so server and first client render match.
 */
export function useStaffIdentity(entries: { id: number; name: string; role: string | null }[]) {
  const [staffId, setStaffId] = useState<number | null>(null)
  const [showIdentityPicker, setShowIdentityPicker] = useState(false)

  useEffect(() => {
    const saved = read()
    if (saved && entries.some((e) => String(e.id) === saved)) setStaffId(Number(saved))
  }, [entries])

  const selectIdentity = useCallback((id: number) => {
    write(id)
    setStaffId(id)
  }, [])

  const clearIdentity = useCallback(() => {
    write(null)
    setStaffId(null)
  }, [])

  return { staffId, showIdentityPicker, selectIdentity, clearIdentity, setShowIdentityPicker }
}
