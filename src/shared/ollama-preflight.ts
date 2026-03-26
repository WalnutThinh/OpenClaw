/** Shipped with env:check for the Ollama provider UI (renderer + main). */
export interface OllamaPreflight {
  totalRamBytes: number
  freeDiskBytes: number | null
  /** Volume used for free-space check (e.g. `C:\\` or `/`). */
  freeDiskCheckPath: string
  /** Windows: WSL Ubuntu ready. macOS/Linux: always true. */
  wslReadyForOllama: boolean
  ramMeetsRecommendation: boolean
  /** null if free disk could not be read */
  diskMeetsRecommendation: boolean | null
  /** Windows: folder on a drive with free space; models use `…/models` under WSL `/mnt/…`. */
  ollamaModelsWinPath: string | null
  /** Resolved WSL path for Ollama blobs. */
  ollamaModelsWslPath: string
}

export const OLLAMA_RECOMMENDED_MIN_RAM_BYTES = 8 * 1024 ** 3
export const OLLAMA_RECOMMENDED_MIN_FREE_DISK_BYTES = 15 * 1024 ** 3
