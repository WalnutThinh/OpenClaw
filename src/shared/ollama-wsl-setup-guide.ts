/**
 * Returned from Windows WSL Ollama resolution so the Config step can show
 * plain-language setup steps (no log parsing).
 */
export type OllamaWslSetupGuideVariant = 'nothing_on_11434' | 'bind_for_wsl' | 'try_windows_host'

export type OllamaWslSetupGuide = {
  variant: OllamaWslSetupGuideVariant
  /** True when Ollama.exe exists under the usual Windows install paths. */
  winStandardInstallFound: boolean
  /** Base URL passed to OpenClaw (for display). */
  attemptedBaseUrl?: string
}
