import { useTranslation } from 'react-i18next'
import Button from '../components/Button'
import { INSTALLABLE_SKILLS } from '../constants/installable-skills'

/** @deprecated Use `SkillsStep.tsx` — merged wizard step. NemoClaw is configured on the Config step. */
export default function HooksStep({
  onDone,
  selectedSkills,
  onToggleSkill
}: {
  onDone: () => void
  selectedSkills: string[]
  onToggleSkill: (id: string, on: boolean) => void
}): React.JSX.Element {
  const { t } = useTranslation('steps')

  return (
    <div className="flex-1 flex flex-col min-h-0 px-8 pb-4">
      <div className="shrink-0 text-center space-y-0.5 pt-2 pb-2">
        <h2 className="text-lg font-extrabold">{t('hooks.title')}</h2>
        <p className="text-[11px] text-text-muted">{t('hooks.subtitle')}</p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
        <div>
          <p className="text-xs font-bold mb-2">{t('hooks.skillsTitle')}</p>
          <div className="space-y-2">
            {INSTALLABLE_SKILLS.map((s) => {
              const on = selectedSkills.includes(s.id)
              return (
                <label
                  key={s.id}
                  className={`flex items-start gap-2 glass-card p-3 rounded-xl border cursor-pointer transition-colors ${
                    on ? 'border-primary/40 bg-primary/8' : 'border-glass-border hover:bg-white/5'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-glass-border"
                    checked={on}
                    onChange={(e) => onToggleSkill(s.id, e.target.checked)}
                  />
                  <span className="text-xs font-semibold">{t(s.labelKey)}</span>
                </label>
              )
            })}
          </div>
        </div>
      </div>

      <div className="shrink-0 flex justify-end pt-2">
        <Button variant="primary" size="sm" onClick={onDone}>
          {t('install.nextBtn')}
        </Button>
      </div>
    </div>
  )
}
