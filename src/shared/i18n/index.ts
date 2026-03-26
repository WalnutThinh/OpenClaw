import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import koCommon from './locales/ko/common.json'
import koSteps from './locales/ko/steps.json'
import koManagement from './locales/ko/management.json'
import koProviders from './locales/ko/providers.json'

import enCommon from './locales/en/common.json'
import enSteps from './locales/en/steps.json'
import enManagement from './locales/en/management.json'
import enProviders from './locales/en/providers.json'

import jaCommon from './locales/ja/common.json'
import jaSteps from './locales/ja/steps.json'
import jaManagement from './locales/ja/management.json'
import jaProviders from './locales/ja/providers.json'

import zhCommon from './locales/zh/common.json'
import zhSteps from './locales/zh/steps.json'
import zhManagement from './locales/zh/management.json'
import zhProviders from './locales/zh/providers.json'

import frCommon from './locales/fr/common.json'
import frSteps from './locales/fr/steps.json'
import frManagement from './locales/fr/management.json'
import frProviders from './locales/fr/providers.json'

import viCommon from './locales/vi/common.json'
import viSteps from './locales/vi/steps.json'
import viManagement from './locales/vi/management.json'
import viProviders from './locales/vi/providers.json'

const i18n: ReturnType<typeof i18next.createInstance> = i18next.createInstance()

i18n.use(initReactI18next).init({
  resources: {
    ko: { common: koCommon, steps: koSteps, management: koManagement, providers: koProviders },
    en: { common: enCommon, steps: enSteps, management: enManagement, providers: enProviders },
    ja: { common: jaCommon, steps: jaSteps, management: jaManagement, providers: jaProviders },
    zh: { common: zhCommon, steps: zhSteps, management: zhManagement, providers: zhProviders },
    fr: { common: frCommon, steps: frSteps, management: frManagement, providers: frProviders },
    vi: { common: viCommon, steps: viSteps, management: viManagement, providers: viProviders }
  },
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'steps', 'management', 'providers'],
  interpolation: { escapeValue: false }
})

export default i18n
