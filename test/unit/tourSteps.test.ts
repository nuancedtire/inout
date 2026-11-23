import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOUR_STEPS } from '#/lib/tour/steps'
import { ADMIN_NAV } from '#/routes/admin/-components/nav'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : /\.tsx$/.test(e.name) ? [join(dir, e.name)] : [],
  )
}

const source = sourceFiles(join(process.cwd(), 'src')).map((f) => readFileSync(f, 'utf8')).join('\n')

/** Anchors written literally (`data-tour="x"`, or `tour="x"` on a Panel) plus the generated nav/dock ones. */
const anchors = new Set([
  ...[...source.matchAll(/\btour="([^"]+)"/g)].map((m) => m[1]),
  ...ADMIN_NAV.flatMap((item) => [`nav-${item.tourId}`, `dock-${item.tourId}`]),
])

describe('admin tour steps', () => {
  it('has unique step ids', () => {
    const ids = TOUR_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('starts and ends on a centered card', () => {
    expect(TOUR_STEPS[0].target).toBeNull()
    expect(TOUR_STEPS.at(-1)!.target).toBeNull()
  })

  it('points every data-tour selector at an anchor that exists in the app', () => {
    const missing = TOUR_STEPS.flatMap((s) => s.target ?? [])
      .map((sel) => /^\[data-tour="([^"]+)"\]$/.exec(sel)?.[1])
      .filter((name): name is string => !!name && !anchors.has(name))
    expect(missing).toEqual([])
  })

  it('only changes page on a step that announces the move', () => {
    TOUR_STEPS.forEach((step, i) => {
      const prev = TOUR_STEPS[i - 1]
      if (prev && prev.path !== step.path) expect(prev.id).toMatch(/^nav-/)
    })
  })
})
