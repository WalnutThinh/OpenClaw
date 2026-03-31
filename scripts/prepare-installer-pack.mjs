/**
 * Run before setup-bootstrapper `electron-builder` portable step.
 * Stops a running launcher and removes previous outputs so
 * electron-builder is less likely to sit on "output file is locked... waiting for unlock".
 */
import { spawnSync } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outExeLauncher = join(root, 'dist', 'installer', 'EClaw-Launcher.exe')
const outExeSetupAlias = join(root, 'dist', 'installer', 'EClaw-Setup.exe')

function killSetupIfWindows() {
  if (process.platform !== 'win32') return
  for (const name of ['EClaw-Launcher.exe', 'EClaw-Setup.exe', 'OPENCLAW-setup.exe']) {
    spawnSync('taskkill.exe', ['/IM', name, '/F', '/T'], {
      stdio: 'ignore',
      windowsHide: true,
    })
  }
}

async function main() {
  killSetupIfWindows()
  const outputs = [outExeLauncher, outExeSetupAlias]
  if (!outputs.some((p) => existsSync(p))) {
    console.log('[prepare-installer-pack] No previous launcher .exe to remove.')
    return
  }
  const attempts = 8
  const waitMs = 2500
  for (let i = 0; i < attempts; i++) {
    try {
      for (const p of outputs) {
        if (existsSync(p)) unlinkSync(p)
      }
      console.log('[prepare-installer-pack] Removed previous launcher executables.')
      return
    } catch (e) {
      if (i === attempts - 1) {
        console.error(
          '[prepare-installer-pack] Cannot delete launcher .exe (still locked). Close the installer, ' +
            'exclude dist\\installer in Windows Defender, then retry.\n',
          e?.message ?? e
        )
        process.exit(1)
      }
      killSetupIfWindows()
      await delay(waitMs)
    }
  }
}

await main()
