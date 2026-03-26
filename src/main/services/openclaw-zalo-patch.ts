/**
 * OpenClaw npm builds ship `extensions/zalo/src/monitor.webhook.ts` with a dev-only import:
 * `../../../src/gateway/net.js` — that path does not exist in the published package (e.g. openclaw@2026.3.23-2).
 * The Mattermost extension uses `openclaw/plugin-sdk/mattermost` for `resolveClientIp`; we align Zalo the same way.
 */
import { spawn } from 'child_process'
import { platform } from 'os'
import { buildWslShellPrefix } from './wsl-utils'
import { findBin, getPathEnv } from './path-utils'

const PATCH_SCRIPT = `const fs=require("fs");
const path=require("path");
const {execSync}=require("child_process");
const root=execSync("npm root -g",{encoding:"utf8"}).trim();
const p=path.join(root,"openclaw/extensions/zalo/src/monitor.webhook.ts");
const BAD='import { resolveClientIp } from "../../../src/gateway/net.js";';
const GOOD='import { resolveClientIp } from "openclaw/plugin-sdk/mattermost";';
if(!fs.existsSync(p)){process.stdout.write("SKIP_NO_FILE\\n");process.exit(0);}
let s=fs.readFileSync(p,"utf8");
if(!s.includes(BAD)){process.stdout.write("SKIP_ALREADY\\n");process.exit(0);}
fs.writeFileSync(p,s.split(BAD).join(GOOD));
process.stdout.write("PATCHED\\n");
`

export type ZaloPatchResult = 'patched' | 'skip' | 'error'

const interpretPatchOutput = (out: string): ZaloPatchResult => {
  if (out.includes('PATCHED')) return 'patched'
  if (out.includes('SKIP_ALREADY') || out.includes('SKIP_NO_FILE')) return 'skip'
  return 'error'
}

const runNodeStdinUnix = (): Promise<ZaloPatchResult> =>
  new Promise((resolve) => {
    const child = spawn(findBin('node'), ['-'], {
      env: getPathEnv(),
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let out = ''
    child.stdout?.on('data', (d) => {
      out += d.toString()
    })
    child.stderr?.on('data', (d) => {
      out += d.toString()
    })
    child.on('error', () => resolve('error'))
    child.on('close', () => resolve(interpretPatchOutput(out)))
    child.stdin?.write(PATCH_SCRIPT)
    child.stdin?.end()
  })

/**
 * WSL: stdin → base64 -d → node (no wslpath / Windows path conversion).
 */
const runPatchWslBase64Pipe = (): Promise<ZaloPatchResult> =>
  new Promise((resolve) => {
    const b64 = Buffer.from(PATCH_SCRIPT, 'utf8').toString('base64')
    const child = spawn(
      'wsl',
      [
        '-d',
        'Ubuntu',
        '-u',
        'root',
        '--',
        'bash',
        '-lc',
        `${buildWslShellPrefix()} && base64 -d | node`
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    )
    let out = ''
    child.stdout?.on('data', (d) => {
      out += d.toString()
    })
    child.stderr?.on('data', (d) => {
      out += d.toString()
    })
    child.on('error', () => resolve('error'))
    child.on('close', (code) => {
      if (code !== 0 && !out.includes('PATCHED') && !out.includes('SKIP_')) {
        resolve('error')
        return
      }
      resolve(interpretPatchOutput(out))
    })
    child.stdin?.write(b64)
    child.stdin?.end()
  })

/**
 * Patches global OpenClaw's Zalo extension when the known bad import is present (idempotent).
 */
export async function applyOpenclawZaloWebhookPatch(): Promise<ZaloPatchResult> {
  if (platform() === 'win32') {
    return runPatchWslBase64Pipe()
  }
  return runNodeStdinUnix()
}
