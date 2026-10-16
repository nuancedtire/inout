import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { parseRota } from '#/utils/rotaParser'

function workbook(rows: unknown[][]): ArrayBuffer {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Rota')
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' })
}

describe('parseRota', () => {
  it('reads XLSX staff, roles and overnight shifts after a title row', () => {
    const buffer = workbook([
      ['Daily rota'],
      ['Name', 'Role', 'Shift'],
      ['Alice Smith', 'Consultant', '08:00–18:00'],
      ['Bob Jones', 'Registrar', '2000-0800'],
    ])

    expect(parseRota(buffer)).toEqual([
      { name: 'Alice Smith', role: 'Consultant', shiftStart: '08:00', shiftEnd: '18:00', rawShift: '08:00–18:00' },
      { name: 'Bob Jones', role: 'Registrar', shiftStart: '20:00', shiftEnd: '08:00', rawShift: '2000-0800' },
    ])
  })

  it('reads CSV using an exact ArrayBuffer and preserves quoted names', () => {
    const buffer = new TextEncoder().encode('Name,Notes,Time\n"Dr. Alice Smith",Locum,13:00-23:45\n').buffer
    expect(parseRota(buffer, {}, 'csv')).toEqual([
      { name: 'Dr. Alice Smith', role: 'Locum', shiftStart: '13:00', shiftEnd: '23:45', rawShift: '13:00-23:45' },
    ])
  })

  it('supports custom column names', () => {
    const buffer = workbook([
      ['Clinician', 'Grade', 'Duty'],
      ['Alice Smith', 'Consultant', '08-1800'],
    ])
    expect(parseRota(buffer, { nameHeader: 'Clinician', roleHeader: 'Grade', shiftHeader: 'Duty' }))
      .toEqual([{ name: 'Alice Smith', role: 'Consultant', shiftStart: '08:00', shiftEnd: '18:00', rawShift: '08-1800' }])
  })

  it('inherits section roles and skips tier labels, repeated headers and blank rows', () => {
    const buffer = workbook([
      ['Name', 'Shift'],
      ['Consultants'],
      ['Tier A'],
      ['Alice Smith', '0800-1800'],
      [],
      ['Name', 'Shift'],
      ['Nurses'],
      ['Bob Jones', '09:00-17:00'],
    ])
    expect(parseRota(buffer)).toMatchObject([
      { name: 'Alice Smith', role: 'Consultants' },
      { name: 'Bob Jones', role: 'Nurses' },
    ])
  })

  it('reads allocation sheets and ignores vacant placeholder slots', () => {
    const buffer = workbook([
      ['Tier A', 'Senior Reg', '', 0.333, 0.375, 0.417],
      ['', '0800-1800', 'Alice Smith'],
      ['', '0800-1800', '***'],
      ['Tier B', 'Junior Reg', '', 0.333, 0.375, 0.417],
      ['', '2000-0800', 'Bob Jones'],
    ])
    expect(parseRota(buffer)).toMatchObject([
      { name: 'Alice Smith', role: 'Senior Reg', shiftStart: '08:00', shiftEnd: '18:00' },
      { name: 'Bob Jones', role: 'Junior Reg', shiftStart: '20:00', shiftEnd: '08:00' },
    ])
  })

  it('retains staff without a scheduled shift', () => {
    expect(parseRota(workbook([['Name', 'Shift'], ['Alice Smith', 'TBC']])))
      .toEqual([{ name: 'Alice Smith', role: null, shiftStart: null, shiftEnd: null, rawShift: 'TBC' }])
  })
})
