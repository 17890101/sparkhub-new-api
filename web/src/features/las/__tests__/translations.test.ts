import { createInstance } from 'i18next'
import { describe, expect, test } from 'vitest'

import en from '@/i18n/locales/en.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zhCN from '@/i18n/locales/zh.json'

const keys = [
  'LAS Connection Lab',
  '1. Platform API token',
  '2. Add reference material (optional)',
  '3. Generate or edit a video',
  '4. Results and reference materials',
  'Generate a new video',
  'Selected material group',
  'Submitted. Follow progress in the results below.',
]

describe('LAS translation resources', () => {
  test.each(['zhCN', 'zhTW'])(
    '%s resolves Chinese LAS instructions without English fallback',
    async (language) => {
      const i18n = createInstance()
      await i18n.init({
        lng: language,
        fallbackLng: false,
        resources: { en, zhCN, zhTW },
        nsSeparator: false,
      })
      expect(i18n.t('LAS Connection Lab')).toBe('LAS 接入测试')
      for (const key of keys) {
        expect(i18n.exists(key), key).toBe(true)
        expect(i18n.t(key), key).toMatch(/[\u4e00-\u9fff]/)
      }
      await i18n.changeLanguage('en')
      for (const key of keys) expect(i18n.exists(key), key).toBe(true)
    }
  )
  test('LAS strings are under the translation namespace rather than unused namespaces', () => {
    expect(Object.keys(zhCN)).toEqual(['translation'])
    expect(Object.keys(zhTW)).toEqual(['translation'])
  })
})
