/**
 * Run before setup-bootstrapper `electron-builder` portable step.
 * Stops a running OPENCLAW-setup.exe and removes the previous output so
 * electron-builder is less likely to sit on "output file is locked... waiting for unlock".
 */
import { spawnSync } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outExe = join(root, 'dist', 'installer', 'OPENCLAW-setup.exe')

function killSetupIfWindows() {
  if (process.platform !== 'win32') return
  spawnSync('taskkill.exe', ['/IM', 'OPENCLAW-setup.exe', '/F', '/T'], {
    stdio: 'ignore',
    windowsHide: true,
  })
}

async function main() {
  killSetupIfWindows()
  if (!existsSync(outExe)) {
    console.log('[prepare-installer-pack] No previous OPENCLAW-setup.exe to remove.')
    return
  }
  const attempts = 8
  const waitMs = 2500
  for (let i = 0; i < attempts; i++) {
    try {
      unlinkSync(outExe)
      console.log('[prepare-installer-pack] Removed previous', outExe)
      return
    } catch (e) {
      if (i === attempts - 1) {
        console.error(
          '[prepare-installer-pack] Cannot delete OPENCLAW-setup.exe (still locked). Close the installer, ' +
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
