import { describe, expect, it } from 'vitest'
import { detectInstallFlavor } from '#/lib/platform'
import { installSteps } from '#/components/checkin/InstallGuide'

const ua = {
  safari26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  safari18: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1',
  samsung: 'Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0 Mobile Safari/537.36',
  pixel: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
}

describe('Add to Home Screen steps per browser', () => {
  it('detects the browser flavour', () => {
    expect(detectInstallFlavor(ua.safari26)).toBe('ios-safari-26')
    expect(detectInstallFlavor(ua.safari18)).toBe('ios-safari')
    expect(detectInstallFlavor(ua.chromeIos)).toBe('ios-chrome')
    expect(detectInstallFlavor(ua.samsung)).toBe('android-samsung')
    expect(detectInstallFlavor(ua.pixel)).toBe('android')
    expect(detectInstallFlavor(ua.desktop)).toBe('other')
  })

  it('starts iOS 26 Safari at the ••• menu, older Safari at Share', () => {
    expect(installSteps('ios-safari-26')).toHaveLength(4)
    expect(installSteps('ios-safari')).toHaveLength(3)
  })
})
