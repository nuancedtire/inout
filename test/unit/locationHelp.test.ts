import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, Fragment } from 'react'
import { detectLocationFlavor } from '#/lib/platform'
import { locationGuide } from '#/components/checkin/LocationHelp'
import { ALLOW_CHECKIN_WITHOUT_LOCATION } from '#/lib/locationPolicy'

const ua = {
  safari26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  safari18: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1',
  firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15',
  samsung: 'Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0 Mobile Safari/537.36',
  pixel: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
}

const text = (node: unknown) => renderToStaticMarkup(createElement(Fragment, null, node as never)).replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;/g, '’').replace(/\u00a0|&nbsp;/g, ' ').replace(/&amp;/g, '&')

describe('Turn on location steps per phone', () => {
  it('detects the phone and browser', () => {
    expect(detectLocationFlavor(ua.safari26)).toBe('ios-safari-26')
    expect(detectLocationFlavor(ua.safari18)).toBe('ios-safari')
    expect(detectLocationFlavor(ua.safari26, 0, true)).toBe('ios-home')
    expect(detectLocationFlavor(ua.chromeIos)).toBe('ios-chrome')
    expect(detectLocationFlavor(ua.firefoxIos)).toBe('ios-other')
    expect(detectLocationFlavor(ua.samsung)).toBe('android-samsung')
    expect(detectLocationFlavor(ua.pixel)).toBe('android-chrome')
    expect(detectLocationFlavor(ua.pixel, 0, true)).toBe('android-chrome-app')
    expect(detectLocationFlavor(ua.desktop)).toBe('other')
  })

  it('walks iPhone Safari through Location Services, Safari Websites, Precise Location and the site setting', () => {
    const steps = locationGuide('ios-safari', 'inout.example').steps.map((s) => text(s.text))
    expect(steps).toHaveLength(4)
    expect(steps[0]).toMatch(/Settings › Privacy & Security › Location Services/)
    expect(steps[1]).toMatch(/Safari Websites.*While Using the App/)
    expect(steps[2]).toMatch(/Precise Location/)
    expect(steps[3]).toMatch(/aA.*Website Settings › Location.*Allow/)
    expect(text(locationGuide('ios-safari-26', 'x').steps[3].text)).toMatch(/page menu/)
  })

  it('uses the Chrome entry on iPhone Chrome and Safari’s setting for Home Screen apps', () => {
    expect(text(locationGuide('ios-chrome', 'x').steps[1].text)).toMatch(/Chrome.*While Using the App/)
    expect(locationGuide('ios-home', 'x').steps).toHaveLength(3)
    expect(locationGuide('ios-home', 'x').after).toBeTruthy()
  })

  it('covers the phone toggle, the site permission and the app permission on Android', () => {
    const chrome = locationGuide('android-chrome', 'inout.example').steps.map((s) => text(s.text))
    expect(chrome[0]).toMatch(/turn on Location/)
    expect(chrome[1]).toMatch(/Permissions › Location.*Allow/)
    expect(chrome[2]).toMatch(/Settings › Apps › Chrome › Permissions › Location.*Use precise location/)
    expect(text(locationGuide('android-chrome-app', 'inout.example').steps[1].text)).toMatch(/Site settings › Location.*inout\.example/)
    const samsung = locationGuide('android-samsung', 'inout.example').steps.map((s) => text(s.text))
    expect(samsung[1]).toMatch(/Sites and downloads › Site permissions › Location/)
    expect(samsung[2]).toMatch(/Samsung Internet/)
  })

  it('keeps the owner’s check-in-anyway switch in one place', () => {
    expect(typeof ALLOW_CHECKIN_WITHOUT_LOCATION).toBe('boolean')
  })
})
