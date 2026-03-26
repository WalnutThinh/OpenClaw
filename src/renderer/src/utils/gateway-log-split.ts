/** Strip common ANSI SGR sequences so tags like `[zalo]` match reliably. */
export function stripAnsiCodes(line: string): string {
  return line.replace(/\x1b\[[0-9;]*m/g, '')
}

/**
 * Classify a single gateway / OpenClaw log line for UI tabs.
 * - **channel**: messaging connectors (Zalo, Telegram, Lark, …) and related security/pairing hints.
 * - **openclaw**: gateway core, agent, tools, ws, fixer box, etc.
 */
export function classifyGatewayLogLine(line: string): 'openclaw' | 'channel' {
  const s = stripAnsiCodes(line)

  if (/\[(zalo|telegram|lark|slack|discord|whatsapp|line)\]/i.test(s)) {
    return 'channel'
  }
  if (/^\s*Zalo:\s/i.test(s)) {
    return 'channel'
  }
  if (/channels\.(zalo|telegram|lark)/i.test(s)) {
    return 'channel'
  }
  if (/\bZalo DMs\b/i.test(s) || /\bpairing approve zalo\b/i.test(s) || /\bzalo.*pairing\b/i.test(s)) {
    return 'channel'
  }

  return 'openclaw'
}

const MAX_LINES = 500

export function appendCapped(prev: string[], line: string): string[] {
  const next = [...prev, line]
  return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
}

/** Split an existing log array (e.g. install/fixer progress) into two tabs. */
export function splitLogLines(lines: string[]): { openclaw: string[]; channels: string[] } {
  const openclaw: string[] = []
  const channels: string[] = []
  for (const line of lines) {
    if (classifyGatewayLogLine(line) === 'channel') channels.push(line)
    else openclaw.push(line)
  }
  return { openclaw, channels }
}
