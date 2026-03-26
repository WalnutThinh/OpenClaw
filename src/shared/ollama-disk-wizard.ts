/**
 * Wizard gate: require enough free disk on the Ollama models volume for the estimated
 * `ollama pull` size plus a headroom buffer (extract, partials, OS).
 */

const GIB = 1024 ** 3

/** Minimum free space that should remain after the model download completes. */
export const OLLAMA_WIZARD_MIN_FREE_AFTER_PULL_BYTES = 10 * GIB

/** Rough on-disk size for `ollama pull` (order-of-magnitude; not exact). */
export function estimateOllamaPullBytes(ollamaModelId: string | undefined): number {
  const raw = ollamaModelId?.trim() ?? ''
  const tag = raw.startsWith('ollama/') ? raw.slice(7).trim().toLowerCase() : raw.toLowerCase()
  if (!tag) return Math.ceil(2.3 * GIB)
  if (tag.includes('llama3.3') || tag.includes('70b')) return 45 * GIB
  if (tag.includes('llama3.2') && tag.includes('3b')) return Math.ceil(2.3 * GIB)
  if (tag.includes('llama3.2') && tag.includes('1b')) return Math.ceil(1.4 * GIB)
  if (tag.includes('gemma3') && tag.includes('1b')) return Math.ceil(0.85 * GIB)
  if (tag.includes('glm')) return Math.ceil(5 * GIB)
  if (tag.includes('qwen') && tag.includes('32b')) return Math.ceil(19 * GIB)
  if (tag.includes('qwen') && tag.includes('7b')) return Math.ceil(4.5 * GIB)
  return Math.ceil(4 * GIB)
}

export function ollamaWizardRequiredFreeDiskBytes(modelId: string | undefined): number {
  return estimateOllamaPullBytes(modelId) + OLLAMA_WIZARD_MIN_FREE_AFTER_PULL_BYTES
}
