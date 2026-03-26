import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import Button from '../components/Button'
import PasswordInput from '../components/PasswordInput'
import { BUNDLED_EMAIL_SKILL_ID, BUNDLED_GOOGLE_WORKSPACE_SKILL_ID } from '../constants/bundled-skills'
import { INSTALLABLE_SKILLS } from '../constants/installable-skills'

export interface BundledSkillRow {
  id: string
  category: string
  name: string
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

export default function SkillsStep({
  onNext,
  selectedSkills,
  onToggleSkill,
  bundledSelectedIds,
  bundledCredentialsBySkill,
  onToggleBundledSkill,
  onBundledCredentialChange
}: {
  onNext: () => void
  selectedSkills: string[]
  onToggleSkill: (id: string, on: boolean) => void
  bundledSelectedIds: string[]
  bundledCredentialsBySkill: Record<string, Record<string, string>>
  onToggleBundledSkill: (id: string, on: boolean) => void
  onBundledCredentialChange: (skillId: string, fieldId: string, value: string) => void
}): React.JSX.Element {
  const { t } = useTranslation('steps')
  const [bundledRows, setBundledRows] = useState<BundledSkillRow[]>([])
  const [bundledLoadError, setBundledLoadError] = useState<string | null>(null)

  useEffect(() => {
    void window.electronAPI.skills
      .listBundled()
      .then((rows) => setBundledRows(rows as BundledSkillRow[]))
      .catch(() => setBundledLoadError(t('additionalSkills.loadError')))
  }, [t])

  const byCategory = useMemo(() => {
    const m = new Map<string, BundledSkillRow[]>()
    for (const s of bundledRows) {
      const list = m.get(s.category) ?? []
      list.push(s)
      m.set(s.category, list)
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [bundledRows])

  const bundledCanProceed = useMemo(() => {
    for (const id of bundledSelectedIds) {
      if (id === BUNDLED_EMAIL_SKILL_ID || id === BUNDLED_GOOGLE_WORKSPACE_SKILL_ID) continue
      const skill = bundledRows.find((x) => x.id === id)
      if (!skill) continue
      for (const f of skill.credentialFields) {
        if (!(bundledCredentialsBySkill[id]?.[f.id] ?? '').trim()) return false
      }
    }
    return true
  }, [bundledSelectedIds, bundledRows, bundledCredentialsBySkill])

  const validationHint = useMemo(() => {
    for (const id of bundledSelectedIds) {
      if (id === BUNDLED_EMAIL_SKILL_ID || id === BUNDLED_GOOGLE_WORKSPACE_SKILL_ID) continue
      const skill = bundledRows.find((x) => x.id === id)
      if (!skill) continue
      for (const f of skill.credentialFields) {
        if (!(bundledCredentialsBySkill[id]?.[f.id] ?? '').trim()) {
          return t('additionalSkills.fillCredentials', { skill: skill.name })
        }
      }
    }
    return null
  }, [bundledSelectedIds, bundledRows, bundledCredentialsBySkill, t])

  const toggleBundled = useCallback(
    (id: string, on: boolean) => {
      onToggleBundledSkill(id, on)
    },
    [onToggleBundledSkill]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col px-8 pb-4">
      <div className="shrink-0 space-y-0.5 pb-2 pt-2 text-center">
        <h2 className="text-lg font-extrabold">{t('skillsStep.title')}</h2>
        <p className="text-[11px] text-text-muted">{t('skillsStep.subtitle')}</p>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto">
        {/* ClawHub / default install set */}
        <div>
          <p className="text-primary mb-2 text-xs font-bold">{t('hooks.skillsTitle')}</p>
          <div className="space-y-2">
            {INSTALLABLE_SKILLS.map((s) => {
              const on = selectedSkills.includes(s.id)
              return (
                <label
                  key={s.id}
                  className={`glass-card flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition-colors ${
                    on ? 'border-primary/40 bg-primary/8' : 'border-glass-border hover:bg-white/5'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="border-glass-border mt-0.5 rounded"
                    checked={on}
                    onChange={(e) => onToggleSkill(s.id, e.target.checked)}
                  />
                  <span className="text-xs font-semibold">{t(s.labelKey)}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Bundled skills (Excel, Email, Google Workspace, …) */}
        <div>
          <p className="text-primary mb-2 text-xs font-bold">{t('skillsStep.bundledSection')}</p>
          <p className="text-text-muted mb-3 text-[10px] leading-snug">{t('skillsStep.bundledHint')}</p>
          {bundledLoadError && (
            <p className="text-error mb-2 text-center text-xs">{bundledLoadError}</p>
          )}
          {bundledRows.length === 0 && !bundledLoadError ? (
            <p className="text-text-muted text-center text-xs">{t('additionalSkills.empty')}</p>
          ) : (
            byCategory.map(([category, rows]) => (
              <div key={category} className="mb-4">
                <p className="text-primary/90 mb-2 text-[11px] font-bold">{category}</p>
                <div className="space-y-2">
                  {rows.map((s) => {
                    const on = bundledSelectedIds.includes(s.id)
                    return (
                      <div key={s.id} className="space-y-2">
                        <label
                          className={`glass-card flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition-colors ${
                            on ? 'border-primary/40 bg-primary/8' : 'border-glass-border hover:bg-white/5'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="border-glass-border mt-0.5 rounded"
                            checked={on}
                            onChange={(e) => toggleBundled(s.id, e.target.checked)}
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
                        {on && s.id === BUNDLED_GOOGLE_WORKSPACE_SKILL_ID && (
                          <div className="border-glass-border ml-1 space-y-2 rounded-xl border border-dashed border-primary/25 bg-primary/[0.04] p-3">
                            <p className="text-primary text-[11px] font-extrabold leading-snug">
                              {t('skillsStep.googleWorkspaceConfigureOnAdditional')}
                            </p>
                          </div>
                        )}
                        {on &&
                          s.id !== BUNDLED_EMAIL_SKILL_ID &&
                          s.id !== BUNDLED_GOOGLE_WORKSPACE_SKILL_ID &&
                          s.credentialFields.length > 0 && (
                          <div className="border-glass-border ml-1 space-y-3 rounded-xl border border-dashed border-primary/25 bg-primary/[0.04] p-3">
                            {s.credentialFields.map((f) => (
                              <div key={f.id}>
                                <label className="text-text-muted mb-1 block text-[10px] font-semibold">
                                  {t(f.labelKey)}
                                </label>
                                {f.type === 'password' ? (
                                  <PasswordInput
                                    value={bundledCredentialsBySkill[s.id]?.[f.id] ?? ''}
                                    onChange={(v) => onBundledCredentialChange(s.id, f.id, v)}
                                    className="!py-2"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={bundledCredentialsBySkill[s.id]?.[f.id] ?? ''}
                                    onChange={(e) => onBundledCredentialChange(s.id, f.id, e.target.value)}
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
      </div>

      {validationHint && (
        <p className="text-warning shrink-0 py-1 text-center text-[10px]">{validationHint}</p>
      )}

      <div className="flex shrink-0 justify-end pt-2">
        <Button
          variant="primary"
          size="sm"
          onClick={onNext}
          disabled={bundledSelectedIds.length > 0 && !bundledCanProceed}
        >
          {t('install.nextBtn')}
        </Button>
      </div>
    </div>
  )
}
