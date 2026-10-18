export function validateManualCheckIn(data: unknown) {
  if (typeof data !== 'object' || data === null) throw new Error('Invalid check-in details')
  if (!('name' in data) || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 200) {
    throw new Error('Enter a name of up to 200 characters')
  }
  const role = 'role' in data ? data.role : undefined
  if (role !== undefined && (typeof role !== 'string' || role.length > 100)) {
    throw new Error('Enter a role of up to 100 characters')
  }
  if (!('token' in data) || typeof data.token !== 'string' || !/^[A-Z2-7]{12}$/.test(data.token)) {
    throw new Error('Invalid or expired QR code')
  }
  return { name: data.name.trim(), role: typeof role === 'string' ? role.trim() || undefined : undefined, token: data.token }
}

/** Per-isolate, best-effort burst protection; not a distributed abuse boundary.
 * Clients sharing an IP share the allowance. Missing IPs share a fallback bucket.
 * Expired buckets are removed, and capacity exhaustion fails closed.
 */
export function createManualCheckInLimiter() {
  const buckets = new Map<string, { count: number; expiresAt: number }>()
  return (clientIp: string | undefined) => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (bucket.expiresAt <= now) buckets.delete(key)
    }
    const key = clientIp || 'unknown'
    const bucket = buckets.get(key)
    if (bucket) {
      if (bucket.count >= 10) throw new Error('Too many check-ins. Please wait a minute and try again.')
      bucket.count++
    } else {
      if (buckets.size >= 2_048) throw new Error('Too many check-ins. Please wait a minute and try again.')
      buckets.set(key, { count: 1, expiresAt: now + 60_000 })
    }
  }
}
