/**
 * Create standardized launcher ZIP package:
 * dist/installer/EClaw-Launcher.zip contains:
 * - EClaw-Launcher.exe
 * - README-INSTALL.txt
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const installerExe = join(root, 'dist', 'installer', 'EClaw-Launcher.exe')
const installerZip = join(root, 'dist', 'installer', 'EClaw-Launcher.zip')
const readmeTemplate = join(root, 'scripts', 'launcher-readme.txt')
const stageDir = join(root, 'dist', 'installer', '_launcher-package')

function fail(msg) {
  console.error('[package-launcher-zip]', msg)
  process.exit(1)
}

function main() {
  if (!existsSync(installerExe)) fail(`missing launcher exe: ${installerExe}`)
  if (!existsSync(readmeTemplate)) fail(`missing readme template: ${readmeTemplate}`)
  if (existsSync(installerZip)) {
    try {
      unlinkSync(installerZip)
    } catch {
      /* ignore */
    }
  }
  rmSync(stageDir, { recursive: true, force: true })
  mkdirSync(stageDir, { recursive: true })
  copyFileSync(installerExe, join(stageDir, 'EClaw-Launcher.exe'))
  copyFileSync(readmeTemplate, join(stageDir, 'README-INSTALL.txt'))
  const command = `Compress-Archive -Path "${stageDir}\\*" -DestinationPath "${installerZip}" -CompressionLevel Optimal -Force`
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  if (r.status !== 0) fail('Compress-Archive failed')
  rmSync(stageDir, { recursive: true, force: true })
  console.log('[package-launcher-zip] wrote', installerZip)
}

main()

