/**
 * electron-builder NSIS template shows "(per-user install) path + Will reinstall"
 * on the install-mode page. We clear that status text for the installer (not uninstaller).
 * Idempotent: safe to run multiple times.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const target = join(root, 'node_modules/app-builder-lib/templates/nsis/multiUserUi.nsh')

if (!existsSync(target)) {
  console.warn('[patch-nsis-multiuser-ui] skip: app-builder-lib not installed yet')
  process.exit(0)
}

let s = readFileSync(target, 'utf8')

const patchInstallReinstallHint = (from, to) => {
  if (s.includes(to)) return false
  if (!s.includes(from)) {
    console.warn('[patch-nsis-multiuser-ui] pattern not found; upstream template may have changed')
    return false
  }
  s = s.replace(from, to)
  return true
}

// Per-user + existing install → empty status (installer only)
patchInstallReinstallHint(
  `\t\t\t\t!ifndef BUILD_UNINSTALLER\n\t\t\t\t\tStrCpy $7 "$(perUserInstallExists)($perUserInstallationFolder)$\\r$\\n$(reinstallUpgrade)"`,
  `\t\t\t\t!ifndef BUILD_UNINSTALLER\n\t\t\t\t\tStrCpy $7 ""`,
)

// Per-machine + existing install → empty status (installer only)
patchInstallReinstallHint(
  `\t\t\t\t!ifndef BUILD_UNINSTALLER\n\t\t\t\t\tStrCpy $7 "$(perMachineInstallExists)($perMachineInstallationFolder)$\\r$\\n$(reinstallUpgrade)"`,
  `\t\t\t\t!ifndef BUILD_UNINSTALLER\n\t\t\t\t\tStrCpy $7 ""`,
)

writeFileSync(target, s, 'utf8')
console.log('[patch-nsis-multiuser-ui] applied (if patterns matched)')
