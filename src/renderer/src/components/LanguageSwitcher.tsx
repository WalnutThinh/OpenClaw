import { useTranslation } from 'react-i18next'

/** Display order: Tiếng Việt → English → 中文 → Français → 日本語 → 한국어 */
const languages = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'fr', label: 'Français' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' }
] as const

export default function LanguageSwitcher(): React.JSX.Element {
  const { i18n } = useTranslation()

  const handleChange = async (lng: string): Promise<void> => {
    const prev = i18n.language
    await i18n.changeLanguage(lng)
    try {
      const result = await window.electronAPI.i18n.setLanguage(lng)
      if (!result.success) await i18n.changeLanguage(prev)
    } catch {
      await i18n.changeLanguage(prev)
    }
  }

  const resolved =
    languages.find((l) => i18n.language === l.code || i18n.language.startsWith(`${l.code}-`))?.code ??
    'en'

  return (
    <select
      value={resolved}
      onChange={(e) => handleChange(e.target.value)}
      className="bg-bg-card border border-glass-border rounded-lg px-2 py-1 text-xs text-text-muted outline-none cursor-pointer hover:border-primary/40 transition-colors"
    >
      {languages.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.label}
        </option>
      ))}
    </select>
  )
}
