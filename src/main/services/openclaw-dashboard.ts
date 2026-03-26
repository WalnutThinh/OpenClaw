/**
 * Open Control UI (dashboard) per https://docs.openclaw.ai/web/dashboard
 * — WebSocket auth uses gateway token; bootstrap via URL hash `#token=...` (see OpenClaw control-ui).
 */
import { shell } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { homedir, platform } from 'os'
import { join } from 'path'
import { getGatewayStatus } from './gateway'
import { readWslFile } from './wsl-utils'

export const OPENCLAW_DASHBOARD_BASE = 'http://127.0.0.1:18789/'

/** Plain string only; SecretRef objects are not embedded (user must paste token in UI). */
export async function readGatewayAuthTokenPlain(): Promise<string | null> {
  try {
    let raw: string
    if (platform() === 'win32') {
      raw = await readWslFile('/root/.openclaw/openclaw.json')
    } else {
      const configPath = join(homedir(), '.openclaw', 'openclaw.json')
      if (!existsSync(configPath)) return null
      raw = readFileSync(configPath, 'utf-8')
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = JSON.parse(raw) as any
    const token = cfg?.gateway?.auth?.token
    if (typeof token === 'string' && token.length > 0) return token
    return null
  } catch {
    return null
  }
}

export function buildDashboardUrl(gatewayToken: string | null): string {
  if (gatewayToken) {
    return `${OPENCLAW_DASHBOARD_BASE}#token=${encodeURIComponent(gatewayToken)}`
  }
  return OPENCLAW_DASHBOARD_BASE
}

export async function openDashboardInSystemBrowser(): Promise<
  { ok: true; hadToken: boolean } | { ok: false; reason: 'gateway_stopped' }
> {
  const gw = await getGatewayStatus()
  if (gw !== 'running') {
    return { ok: false, reason: 'gateway_stopped' }
  }
  const token = await readGatewayAuthTokenPlain()
  const url = buildDashboardUrl(token)
  await shell.openExternal(url)
  return { ok: true, hadToken: !!token }
}
