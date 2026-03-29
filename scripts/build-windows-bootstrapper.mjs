/**
 * Builds the small Windows installer at ../dist/installer/OPENCLAW-setup.exe (~Electron UI only).
 * Writes build/install-manifest.json with the HTTPS URL of the app zip (hosted separately).
 *
 * Env (optional):
 *   OPENCLAW_APP_ZIP_URL     — full URL to the zip (overrides base + basename)
 *   OPENCLAW_APP_ZIP_BASE_URL — default https://enchante.cloud/downloads
 *
 * Still copies dist app zip → setup-bootstrapper/payload/openclaw-app.zip for local `npm run dev`.
 *
 * From repo root: npm run build:win-setup
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const distDir = join(root, 'dist')
const bootstrapDir = join(root, 'setup-bootstrapper')
const payloadDir = join(bootstrapDir, 'payload')
const payloadZip = join(payloadDir, 'openclaw-app.zip')
const buildDir = join(bootstrapDir, 'build')
const manifestPath = join(buildDir, 'install-manifest.json')

function findWinAppZip() {
  if (!existsSync(distDir)) return null
  const files = readdirSync(distDir).filter((f) => {
    if (!f.endsWith('.zip')) return false
    if (/^OPENCLAW-setup/i.test(f)) return false
    if (/win32-x64/i.test(f)) return true
    if (/[.-]win\.zip$/i.test(f)) return true
    return false
  })
  if (files.length === 0) return null
  files.sort()
  return join(distDir, files[files.length - 1])
}

function ensureAppZip() {
  let z = findWinAppZip()
  if (!z) {
    console.log('[build-windows-bootstrapper] Building main app Windows zip (build:win-app-zip)…')
    const r = spawnSync('npm', ['run', 'build:win-app-zip'], { cwd: root, stdio: 'inherit', shell: true })
    if (r.status !== 0) process.exit(r.status ?? 1)
    z = findWinAppZip()
  }
  if (!z) {
    console.error(
      '[build-windows-bootstrapper] No app zip in dist/ (expected *-win.zip or *-win32-x64.zip). Run npm run build:win-app-zip first.'
    )
    process.exit(1)
  }
  return z
}

function writeManifest(zipPath) {
  const zipName = basename(zipPath)
  const fullOverride = (process.env.OPENCLAW_APP_ZIP_URL ?? '').trim()
  const appZipUrl = fullOverride || (() => {
    const base = (process.env.OPENCLAW_APP_ZIP_BASE_URL ?? 'https://enchante.cloud/downloads').replace(/\/$/, '')
    return `${base}/${encodeURIComponent(zipName)}`
  })()
  mkdirSync(buildDir, { recursive: true })
  writeFileSync(manifestPath, JSON.stringify({ appZipUrl }, null, 2) + '\n', 'utf8')
  console.log('[build-windows-bootstrapper] Wrote', manifestPath)
  console.log('[build-windows-bootstrapper]   appZipUrl:', appZipUrl)
  console.log(
    '[build-windows-bootstrapper] Host this file at that URL (e.g. sync OpenClaw-*-win.zip to enchante.cloud/public/downloads/).'
  )
}

function copyPayloadForDev(zipPath) {
  mkdirSync(payloadDir, { recursive: true })
  copyFileSync(zipPath, payloadZip)
  console.log('[build-windows-bootstrapper] Dev payload:', zipPath, '→', payloadZip)
}

function copyBranding() {
  const iconSrc = join(root, 'build', 'icon.ico')
  const iconDst = join(bootstrapDir, 'build', 'icon.ico')
  if (existsSync(iconSrc)) {
    mkdirSync(join(bootstrapDir, 'build'), { recursive: true })
    copyFileSync(iconSrc, iconDst)
  }
  const pairs = [
    ['setup-bootstrapper/src/renderer/src/assets/openclaw-dark.svg', 'public/openclaw-dark.svg'],
    ['setup-bootstrapper/src/renderer/src/assets/openclaw-text.svg', 'public/openclaw-text.svg'],
    ['setup-bootstrapper/src/renderer/src/assets/enchante-direction-black.svg', 'public/enchante-direction-black.svg']
  ]
  for (const [rel, destRel] of pairs) {
    const from = join(root, rel)
    const to = join(bootstrapDir, destRel)
    if (existsSync(from)) {
      mkdirSync(dirname(to), { recursive: true })
      copyFileSync(from, to)
    }
  }
}

function main() {
  const z = ensureAppZip()
  writeManifest(z)
  copyPayloadForDev(z)
  copyBranding()
  console.log('[build-windows-bootstrapper] Packing bootstrapper (setup-bootstrapper)…')
  const install = spawnSync('npm', ['install'], { cwd: bootstrapDir, stdio: 'inherit', shell: true })
  if (install.status !== 0) process.exit(install.status ?? 1)
  const pack = spawnSync('npm', ['run', 'pack'], { cwd: bootstrapDir, stdio: 'inherit', shell: true })
  if (pack.status !== 0) process.exit(pack.status ?? 1)
  console.log('[build-windows-bootstrapper] Done. Small installer: dist/installer/OPENCLAW-setup.exe')
}

main()
