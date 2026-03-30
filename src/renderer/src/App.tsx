import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import StepIndicator from './components/StepIndicator'
import UpdateBanner from './components/UpdateBanner'
import TwinkleDots from './components/TwinkleDots'
import openclawMarkSrc from './assets/openclaw-color.svg'
import { useWizard } from './hooks/useWizard'
import WelcomeStep from './steps/WelcomeStep'
import EnvCheckStep from './steps/EnvCheckStep'
import WslSetupStep from './steps/WslSetupStep'
import InstallStep from './steps/InstallStep'
import ApiKeyGuideStep from './steps/ApiKeyGuideStep'
import type { Provider } from './constants/providers'
import AppchatGuideStep from './steps/AppchatGuideStep'
import SkillsStep from './steps/SkillsStep'
import AdditionalApisStep from './steps/AdditionalApisStep'
import ConfigStep from './steps/ConfigStep'
import DoneStep from './steps/DoneStep'
import TroubleshootStep from './steps/TroubleshootStep'

type WslState =
  | 'not_available'
  | 'not_installed'
  | 'needs_reboot'
  | 'no_distro'
  | 'not_initialized'
  | 'ready'

interface InstallNeeds {
  needNode: boolean
  needOpenclaw: boolean
  needPython: boolean
}

function App(): React.JSX.Element {
  const { t } = useTranslation('common')
  const { currentStep, next, prev, canGoBack, goTo } = useWizard()
  const [installNeeds, setInstallNeeds] = useState<InstallNeeds>({
    needNode: false,
    needOpenclaw: false,
    needPython: false
  })
  const [provider, setProvider] = useState<Provider>('ollama')
  const [modelId, setModelId] = useState<string | undefined>()
  const [authMethod, setAuthMethod] = useState<'api-key' | 'oauth'>('api-key')
  const [providerApiKey, setProviderApiKey] = useState('')
  const [oauthCompleted, setOauthCompleted] = useState(false)
  const [botUsername, setBotUsername] = useState<string | undefined>()
  /** Default true on Win UA so Config Ollama help is not hidden before env:check returns. */
  const [isWindows, setIsWindows] = useState(
    () => typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)
  )
  const [hostOs, setHostOs] = useState<'macos' | 'windows' | 'linux'>('windows')
  const [wslState, setWslState] = useState<WslState>('ready')
  const [version, setVersion] = useState('')
  const [telegramToken, setTelegramToken] = useState('')
  const [zaloBotToken, setZaloBotToken] = useState('')
  const [zaloOaId, setZaloOaId] = useState('')
  const [zaloOaSecret, setZaloOaSecret] = useState('')
  const [larkAppId, setLarkAppId] = useState('')
  const [larkAppSecret, setLarkAppSecret] = useState('')
  const [enableNemoShield, setEnableNemoShield] = useState(false)
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [bundledSkillIds, setBundledSkillIds] = useState<string[]>([])
  const [bundledCredentials, setBundledCredentials] = useState<Record<string, Record<string, string>>>(
    {}
  )

  const toggleSkill = useCallback((id: string, on: boolean): void => {
    setSelectedSkills((prev) => (on ? [...prev.filter((x) => x !== id), id] : prev.filter((x) => x !== id)))
  }, [])

  const toggleBundledSkill = useCallback((id: string, on: boolean): void => {
    setBundledSkillIds((prev) => (on ? [...prev.filter((x) => x !== id), id] : prev.filter((x) => x !== id)))
    if (!on) {
      setBundledCredentials((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }, [])

  const setBundledCredential = useCallback((skillId: string, fieldId: string, value: string): void => {
    setBundledCredentials((prev) => ({
      ...prev,
      [skillId]: { ...(prev[skillId] ?? {}), [fieldId]: value }
    }))
  }, [])

  useEffect(() => {
    window.electronAPI.version().then(setVersion)

    window.electronAPI.env.check().then(async (env) => {
      setIsWindows(env.os === 'windows')
      setHostOs(env.os)
      if (env.wslState) setWslState(env.wslState)

      const state = await window.electronAPI.wizard.loadState()
      const resumeSteps = ['wslSetup', 'envCheck'] as const
      if (state && resumeSteps.includes(state.step as (typeof resumeSteps)[number])) {
        goTo(state.step as 'wslSetup' | 'envCheck')
      }
    })
  }, [goTo])

  const handleEnvCheckDone = (env: {
    os: string
    nodeVersionOk: boolean
    openclawInstalled: boolean
    pythonVersionOk: boolean
    wslState?: WslState
  }): void => {
    const wslReady = env.os !== 'windows' || env.wslState === 'ready'
    setInstallNeeds({
      needNode: !env.nodeVersionOk,
      needOpenclaw: !env.openclawInstalled,
      needPython: wslReady && !env.pythonVersionOk
    })

    if (env.os === 'windows' && env.wslState && env.wslState !== 'ready') {
      setWslState(env.wslState)
      goTo('wslSetup')
      return
    }

    goTo('install')
  }

  const handleWslReady = useCallback((): void => {
    window.electronAPI.wizard.clearState()
    goTo('envCheck')
  }, [goTo])

  const handleConfigDone = useCallback(
    (username?: string): void => {
      setBotUsername(username)
      window.electronAPI.wizard.clearState()
      goTo('done')
    },
    [goTo]
  )

  return (
    <>
      <div className="aurora-bg" />
      <TwinkleDots />
      <div className="grain-overlay" />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {currentStep !== 'welcome' && currentStep !== 'troubleshoot' && (
          <StepIndicator currentStep={currentStep} isWindows={isWindows} />
        )}

        <div className="step-enter flex min-h-0 flex-1 flex-col overflow-hidden" key={currentStep}>
          {currentStep === 'welcome' && <WelcomeStep onNext={next} />}
          {currentStep === 'envCheck' && (
            <EnvCheckStep onNext={() => goTo('apiKeyGuide')} onNeedInstall={handleEnvCheckDone} />
          )}
          {currentStep === 'wslSetup' && (
            <WslSetupStep wslState={wslState} onReady={handleWslReady} />
          )}
          {currentStep === 'install' && (
            <InstallStep needs={installNeeds} onDone={() => goTo('apiKeyGuide')} />
          )}
          {currentStep === 'apiKeyGuide' && (
            <ApiKeyGuideStep
              provider={provider}
              onSelectProvider={(p) => {
                setProvider(p)
                setModelId(undefined)
                setAuthMethod('api-key')
                setProviderApiKey('')
                setOauthCompleted(false)
              }}
              authMethod={authMethod}
              onSelectAuthMethod={setAuthMethod}
              modelId={modelId}
              onSelectModel={setModelId}
              apiKey={providerApiKey}
              onApiKeyChange={setProviderApiKey}
              oauthCompleted={oauthCompleted}
              onOauthCompleted={setOauthCompleted}
              onNext={next}
              isWindows={isWindows}
              hostOs={hostOs}
            />
          )}
          {currentStep === 'appchatGuide' && (
            <AppchatGuideStep
              telegramToken={telegramToken}
              onTelegramTokenChange={setTelegramToken}
              zaloBotToken={zaloBotToken}
              onZaloBotTokenChange={setZaloBotToken}
              zaloOaId={zaloOaId}
              onZaloOaIdChange={setZaloOaId}
              zaloOaSecret={zaloOaSecret}
              onZaloOaSecretChange={setZaloOaSecret}
              larkAppId={larkAppId}
              onLarkAppIdChange={setLarkAppId}
              larkAppSecret={larkAppSecret}
              onLarkAppSecretChange={setLarkAppSecret}
              onNext={next}
            />
          )}
          {currentStep === 'skills' && (
            <SkillsStep
              onNext={() => goTo('additionalApis')}
              selectedSkills={selectedSkills}
              onToggleSkill={toggleSkill}
              bundledSelectedIds={bundledSkillIds}
              bundledCredentialsBySkill={bundledCredentials}
              onToggleBundledSkill={toggleBundledSkill}
              onBundledCredentialChange={setBundledCredential}
            />
          )}
          {currentStep === 'additionalApis' && (
            <AdditionalApisStep
              bundledSkillIds={bundledSkillIds}
              bundledCredentialsBySkill={bundledCredentials}
              enableNemoShield={enableNemoShield}
              onToggleNemo={setEnableNemoShield}
              onBundledCredentialChange={setBundledCredential}
              provider={provider}
              modelId={modelId}
              onGoChooseAiProvider={() => goTo('apiKeyGuide')}
              onNext={() => goTo('config')}
            />
          )}
          {currentStep === 'config' && (
            <ConfigStep
              provider={provider}
              authMethod={authMethod}
              modelId={modelId}
              enableNemoShield={enableNemoShield}
              selectedSkills={selectedSkills}
              bundledSkillSelections={bundledSkillIds.map((id) => ({
                id,
                credentials: bundledCredentials[id] ?? {}
              }))}
              telegramToken={telegramToken}
              zaloBotToken={zaloBotToken}
              zaloOaId={zaloOaId}
              zaloOaSecret={zaloOaSecret}
              larkAppId={larkAppId}
              larkAppSecret={larkAppSecret}
              providerApiKey={providerApiKey}
              oauthCompleted={oauthCompleted}
              isWindows={isWindows}
              onDone={handleConfigDone}
            />
          )}
          {currentStep === 'done' && (
            <DoneStep
              botUsername={botUsername}
              onTroubleshoot={() => goTo('troubleshoot')}
              onUninstallDone={() => {
                window.electronAPI.wizard.clearState()
                goTo('welcome')
              }}
            />
          )}
          {currentStep === 'troubleshoot' && (
            <TroubleshootStep isWindows={isWindows} onBack={prev} />
          )}
        </div>

        {canGoBack && currentStep !== 'troubleshoot' && (
          <div className="relative z-20 flex shrink-0 items-center border-t border-white/5 bg-black/35 px-4 py-2 backdrop-blur-md">
            <button
              type="button"
              onClick={prev}
              className="flex items-center gap-1.5 rounded-lg border border-glass-border bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-text-muted transition-all duration-200 hover:bg-white/10 hover:text-text"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              {t('button.back')}
            </button>
          </div>
        )}

        <footer
          className={`relative z-30 flex shrink-0 items-center border-t border-white/5 bg-black/40 px-4 backdrop-blur-md ${
            currentStep === 'done' ? 'h-[3.25rem]' : 'h-11'
          }`}
        >
          <div className="pointer-events-none absolute left-4 flex items-center gap-2.5">
            {currentStep === 'done' && (
              <img
                src={openclawMarkSrc}
                alt=""
                className="h-8 w-8 shrink-0 object-contain"
                aria-hidden
              />
            )}
            <span className="text-[10px] font-mono tabular-nums text-text-muted/50">
              {t('versionDisplay', { version: (version || '1.1.2').replace(/^v/i, '') })}
            </span>
          </div>
          <div className="flex flex-1" aria-hidden="true" />
          <div className="absolute right-4 flex items-center gap-3">
            {import.meta.env.DEV && currentStep !== 'done' && (
              <button
                type="button"
                onClick={() => goTo('done')}
                className="text-[9px] font-mono text-text-muted/30 transition-colors hover:text-primary/60"
              >
                [skip→done]
              </button>
            )}
            <a
              href="mailto:mess@enchante.cloud"
              className="flex items-center gap-1.5 text-[10px] font-medium text-text-muted/70 transition-colors hover:text-primary/85"
              title="mess@enchante.cloud"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 opacity-90"
                aria-hidden
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              mess@enchante.cloud
            </a>
          </div>
        </footer>

        <UpdateBanner />
      </div>
    </>
  )
}

export default App
