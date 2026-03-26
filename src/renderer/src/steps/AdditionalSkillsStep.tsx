import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import Button from '../components/Button'
import PasswordInput from '../components/PasswordInput'
import { BUNDLED_EMAIL_SKILL_ID } from '../constants/bundled-skills'

export interface BundledSkillRow {
  id: string
  category: string
  name: string
  /** From SKILL.md description (truncated); UI may prefer i18n skillSummaries[id] */
  summary: string
  credentialFields: { id: string; labelKey: string; type: 'text' | 'password' }[]
}

function pickSkillSubtitle(id: string, backendSummary: string, t: TFunction): string {
  const obj = t('additionalSkills.skillSummaries', { returnObjects: true, defaultValue: {} })
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const v = (obj as Record<string, string>)[id]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  const s = (backendSummary ?? '').trim()
  if (s) return s
  return id
}

/** @deprecated Use `SkillsStep.tsx` — merged wizard step. */
export default function AdditionalSkillsStep({
  selectedIds,
  credentialsBySkill,
  onToggleSkill,
  onCredentialChange,
  onNext
}: {
  selectedIds: string[]
  credentialsBySkill: Record<string, Record<string, string>>
  onToggleSkill: (id: string, on: boolean) => void
  onCredentialChange: (skillId: string, fieldId: string, value: string) => void
  onNext: () => void
}): React.JSX.Element {
  const { t } = useTranslation('steps')
  const [skills, setSkills] = useState<BundledSkillRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    void window.electronAPI.skills
      .listBundled()
      .then((rows) => setSkills(rows as BundledSkillRow[]))
      .catch(() => setLoadError(t('additionalSkills.loadError')))
  }, [t])

  const byCategory = useMemo(() => {
    const m = new Map<string, BundledSkillRow[]>()
    for (const s of skills) {
      const list = m.get(s.category) ?? []
      list.push(s)
      m.set(s.category, list)
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [skills])

  const canProceed = useMemo(() => {
    for (const id of selectedIds) {
      if (id === BUNDLED_EMAIL_SKILL_ID) continue
      const skill = skills.find((x) => x.id === id)
      if (!skill) continue
      for (const f of skill.credentialFields) {
        if (!(credentialsBySkill[id]?.[f.id] ?? '').trim()) return false
      }
    }
    return true
  }, [selectedIds, skills, credentialsBySkill])

  const validationHint = useMemo(() => {
    for (const id of selectedIds) {
      if (id === BUNDLED_EMAIL_SKILL_ID) continue
      const skill = skills.find((x) => x.id === id)
      if (!skill) continue
      for (const f of skill.credentialFields) {
        if (!(credentialsBySkill[id]?.[f.id] ?? '').trim()) {
          return t('additionalSkills.fillCredentials', { skill: skill.name })
        }
      }
    }
    return null
  }, [selectedIds, skills, credentialsBySkill, t])

  const toggle = useCallback(
    (id: string, on: boolean) => {
      onToggleSkill(id, on)
    },
    [onToggleSkill]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col px-8 pb-4">
      <div className="shrink-0 space-y-0.5 pb-2 pt-2 text-center">
        <h2 className="text-lg font-extrabold">{t('additionalSkills.title')}</h2>
        <p className="text-[11px] text-text-muted">{t('additionalSkills.subtitle')}</p>
      </div>

      {loadError && <p className="text-error mb-2 text-center text-xs">{loadError}</p>}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {skills.length === 0 && !loadError ? (
          <p className="text-text-muted text-center text-xs">{t('additionalSkills.empty')}</p>
        ) : (
          byCategory.map(([category, rows]) => (
            <div key={category}>
              <p className="text-primary mb-2 text-xs font-bold">{category}</p>
              <div className="space-y-2">
                {rows.map((s) => {
                  const on = selectedIds.includes(s.id)
                  return (
                    <div key={s.id} className="space-y-2">
                      <label
                        className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition-colors glass-card ${
                          on ? 'border-primary/40 bg-primary/8' : 'border-glass-border hover:bg-white/5'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="border-glass-border mt-0.5 rounded"
                          checked={on}
                          onChange={(e) => toggle(s.id, e.target.checked)}
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-semibold">{s.name}</span>
                          <p
                            className="text-text-muted/80 mt-0.5 text-[10px] leading-snug"
                            title={s.id}
                          >
                            {pickSkillSubtitle(s.id, s.summary, t)}
                          </p>
                        </div>
                      </label>
                      {on && s.id === BUNDLED_EMAIL_SKILL_ID && (
                        <div className="border-glass-border ml-1 space-y-2 rounded-xl border border-dashed border-primary/25 bg-primary/[0.04] p-3">
                          <p className="text-primary text-[11px] font-extrabold leading-snug">
                            {t('skillsStep.emailConfigureOnAdditional')}
                          </p>
                          <p className="text-text-muted/90 text-[10px] leading-snug">
                            {t('skillsStep.emailTestAfterConfig')}
                          </p>
                        </div>
                      )}
                      {on && s.id !== BUNDLED_EMAIL_SKILL_ID && s.credentialFields.length > 0 && (
                        <div className="border-glass-border ml-1 space-y-3 rounded-xl border border-dashed border-primary/25 bg-primary/[0.04] p-3">
                          {s.credentialFields.map((f) => (
                            <div key={f.id}>
                              <label className="text-text-muted mb-1 block text-[10px] font-semibold">
                                {t(f.labelKey)}
                              </label>
                              {f.type === 'password' ? (
                                <PasswordInput
                                  value={credentialsBySkill[s.id]?.[f.id] ?? ''}
                                  onChange={(v) => onCredentialChange(s.id, f.id, v)}
                                  className="!py-2"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={credentialsBySkill[s.id]?.[f.id] ?? ''}
                                  onChange={(e) => onCredentialChange(s.id, f.id, e.target.value)}
                                  className="border-glass-border w-full rounded-xl border bg-white/5 px-3 py-2 text-sm text-text focus:border-primary/60 focus:outline-none"
                                  autoComplete="off"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {validationHint && (
        <p className="text-warning shrink-0 py-1 text-center text-[10px]">{validationHint}</p>
      )}

      <div className="flex shrink-0 justify-end pt-2">
        <Button
          variant="primary"
          size="sm"
          onClick={onNext}
          disabled={selectedIds.length > 0 && !canProceed}
        >
          {t('install.nextBtn')}
        </Button>
      </div>
    </div>
  )
}
