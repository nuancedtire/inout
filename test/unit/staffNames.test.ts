import { describe, expect, it } from 'vitest'
import { nameKey, namesLookAlike } from '#/utils/staffNames'

describe('nameKey', () => {
  it('ignores titles, bracketed notes and "Surname, First" order', () => {
    expect(nameKey('Dr John Smith')).toBe('john smith')
    expect(nameKey('DR. JOHN  SMITH')).toBe('john smith')
    expect(nameKey('Prof Dr Zoë Núñez')).toBe('zoe nunez')
    expect(nameKey('Smith, John')).toBe('john smith')
    expect(nameKey('Dr Smith, John (locum)')).toBe('john smith')
    expect(nameKey('John Smith [bank]')).toBe('john smith')
    expect(nameKey('Mrs Ms')).toBe('ms')
  })

  it('keeps punctuation and never returns an empty key', () => {
    expect(nameKey("Dr O'Neil")).toBe("o'neil")
    expect(nameKey('Alice-Smith')).not.toBe(nameKey('Alice Smith'))
    expect(nameKey('Dr')).toBe('dr')
    expect(nameKey('(locum)')).toBe('(locum)')
  })
})

describe('namesLookAlike', () => {
  const alike = (a: string, b: string) => namesLookAlike(nameKey(a), nameKey(b))

  it('suggests an initial, a missing middle name, swapped order and small typos', () => {
    expect(alike('J Smith', 'John Smith')).toBe(true)
    expect(alike('J. Smith', 'John Smith')).toBe(true)
    expect(alike('SMITH J', 'John Smith')).toBe(true)
    expect(alike('Smith, J', 'John Smith')).toBe(true)
    expect(alike('John Smith', 'J Smith')).toBe(true)
    expect(alike('John Smith', 'John Adam Smith')).toBe(true)
    expect(alike('Smith John', 'John Smith')).toBe(true)
    expect(alike('Jon Smith', 'John Smith')).toBe(true)
    expect(alike('Jonh Smith', 'John Smith')).toBe(true)
    expect(alike('Alice-Smith', 'Alice Smith')).toBe(true)
    expect(alike('Siobhan McAllister', 'Siobahn MacAllister')).toBe(true)
  })

  it('does not suggest different people or identical names', () => {
    expect(alike('John Smith', 'John Smith')).toBe(false)
    expect(alike('John Smith', 'Jane Jones')).toBe(false)
    expect(alike('K Smith', 'John Smith')).toBe(false)
    expect(alike('Smith K', 'John Smith')).toBe(false)
    expect(alike('John Smith', 'John Smyth-Brown')).toBe(false)
    expect(alike('Ann Lee', 'Ian Lee')).toBe(false)
    expect(alike('Smith', 'John Smith')).toBe(false)
  })
})

describe('firstLastOrder', () => {
  it('reorders "Surname, First" and drops notes for initials', async () => {
    const { firstLastOrder } = await import('#/utils/staffNames')
    const { initials } = await import('#/components/checkin/copy')
    expect(firstLastOrder('Patel, Priya (locum)')).toBe('Priya Patel')
    expect(initials('Patel, Priya (locum)')).toBe('PP')
    expect(initials('Dr John Smith')).toBe('JS')
  })
})
