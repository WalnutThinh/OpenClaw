/** Patterns for OpenClaw / channel CLI “pairing list” output (EN + common variants). */
const PAIRING_PATTERNS: RegExp[] = [
  /Pairing\s*code\s*[:：]\s*([A-Z0-9][A-Z0-9-]{2,})/gi,
  /pairing\s*code\s*[:：]\s*([A-Z0-9][A-Z0-9-]{2,})/gi,
  /Mã\s*ghép\s*[:：]?\s*([A-Z0-9][A-Z0-9-]{2,})/gi,
  /mã\s*ghép\s*[:：]?\s*([A-Z0-9][A-Z0-9-]{2,})/gi
]

export function extractZaloPairingCodes(text: string): string[] {
  const codes = new Set<string>()
  for (const re of PAIRING_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const raw = m[1]?.trim()
      if (!raw) continue
      const c = raw.toUpperCase()
      if (c.length >= 4 && /^[A-Z0-9-]+$/.test(c)) codes.add(c)
    }
  }
  return [...codes]
}

/** Prefer the code mentioned nearest the end of the output (usually the latest pending). */
export function extractPrimaryZaloPairingCode(text: string): string | null {
  const all = extractZaloPairingCodes(text)
  if (all.length === 0) return null
  const upper = text.toUpperCase()
  let best: string | null = null
  let bestIdx = -1
  for (const code of all) {
    const idx = upper.lastIndexOf(code)
    if (idx >= bestIdx) {
      bestIdx = idx
      best = code
    }
  }
  return best
}
