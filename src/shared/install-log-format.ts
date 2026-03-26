/** Remove ANSI SGR sequences so install logs render as plain text in the UI. */
export function stripAnsi(str: string): string {
  /* eslint-disable no-control-regex */
  return str
    .replace(/\u001b\[[\d;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][\d;:]*[^\u0007]*\u0007/g, '')
}

/** Split installer script output (e.g. Ollama `>>> step`) into readable log lines. */
export function splitInstallProgressMessages(msg: string): string[] {
  const normalized = stripAnsi(msg).replace(/\r\n/g, '\n').replace(/\r/g, '')
  const out: string[] = []
  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trimEnd()
    if (!line) continue
    if (!line.includes('>>>')) {
      out.push(line)
      continue
    }
    for (const part of line.split(/(?=>>>)/g)) {
      const s = part.trimEnd()
      if (s.length) out.push(s)
    }
  }
  return out
}
