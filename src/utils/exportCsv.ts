import Papa from 'papaparse'
import type { Identity, LocationOutcome, SessionFlagReason } from './verification'
import { flagLabels } from './verification'

export type ExportRow = {
  name: string
  role: string | null
  check_in_at: string
  check_out_at: string | null
  hours: number | null
  identity_in: Identity
  location_in: LocationOutcome
  identity_out: Identity | null
  location_out: LocationOutcome | null
  verified: boolean
  accepted: boolean
  reasons: SessionFlagReason[]
  review_note: string | null
}

export const EXPORT_HEADER = ['Name', 'Role', 'Check in', 'Check out', 'Hours', 'Identity in', 'Location in', 'Identity out', 'Location out', 'Verified', 'Flags', 'Review']

/**
 * Attendance CSV. Identity/location columns use stable codes (passkey, passkey_pending,
 * self_selected, admin; inside, outside, denied, unavailable, not_requested); Flags are readable
 * labels joined with "; ". Free text (names, notes) is protected against spreadsheet formulae.
 */
export function buildAttendanceCsv(rows: ExportRow[]): string {
  return Papa.unparse([
    EXPORT_HEADER,
    ...rows.map((r) => [
      r.name,
      r.role || '',
      r.check_in_at,
      r.check_out_at || '',
      r.hours?.toFixed(2) || '',
      r.identity_in,
      r.location_in,
      r.identity_out ?? '',
      r.location_out ?? '',
      r.verified ? 'Yes' : 'No',
      flagLabels(r.reasons),
      r.accepted ? `Accepted${r.review_note ? `: ${r.review_note}` : ''}` : '',
    ]),
  ], { escapeFormulae: true })
}
