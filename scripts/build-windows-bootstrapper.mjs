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
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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

function readRootPackageVersion() {
  try {
    const raw = readFileSync(join(root, 'package.json'), 'utf8')
    const v = JSON.parse(raw)?.version
    return typeof v === 'string' && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

/** Tag v1.1.02 on this repo ships OpenClaw-1.1.2-win.zip; OpenClaw-1.1.02-win.zip is a common mistaken URL (404). */
function normalizeAppZipUrl(url) {
  try {
    const u = new URL(url)
    if (u.hostname !== 'github.com') return url
    const parts = u.pathname.split('/').filter(Boolean)
    const d = parts.indexOf('download')
    if (d < 0 || parts.length < d + 3) return url
    const tag = parts[d + 1]
    const file = parts[d + 2]
    if (
      parts[0] === 'WalnutThinh' &&
      parts[1] === 'OpenClaw' &&
      tag === 'v1.1.02' &&
      file === 'OpenClaw-1.1.02-win.zip'
    ) {
      parts[d + 2] = 'OpenClaw-1.1.2-win.zip'
      u.pathname = `/${parts.join('/')}`
      return u.toString()
    }
  } catch {
    /* ignore */
  }
  return url
}

function findWinAppZip() {
  if (!existsSync(distDir)) return null
  const pkgVersion = readRootPackageVersion()
  if (pkgVersion) {
    const exact = join(distDir, `OpenClaw-${pkgVersion}-win.zip`)
    if (existsSync(exact)) return exact
  }
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
  const pkgVersion = readRootPackageVersion()
  const expectedZip = pkgVersion ? `OpenClaw-${pkgVersion}-win.zip` : null
  const fullOverride = (process.env.OPENCLAW_APP_ZIP_URL ?? '').trim()
  const standardWinZip = /-win\.zip$/i.test(zipName) && !/win32-x64/i.test(zipName)
  if (
    !fullOverride &&
    expectedZip &&
    standardWinZip &&
    zipName !== expectedZip
  ) {
    console.error(
      `[build-windows-bootstrapper] dist has "${zipName}" but package.json version expects "${expectedZip}". ` +
        `Remove stale zips from dist/ or run npm run build:win-app-zip. ` +
        `Or set OPENCLAW_APP_ZIP_URL to the exact hosted asset URL (e.g. GitHub tag vs filename can differ).`
    )
    process.exit(1)
  }
  if (expectedZip && zipName !== expectedZip && fullOverride) {
    console.warn(
      `[build-windows-bootstrapper] Zip basename "${zipName}" does not match package.json (expected "${expectedZip}"); manifest URL comes from OPENCLAW_APP_ZIP_URL.`
    )
  }
  let appZipUrl = fullOverride || (() => {
    const base = (process.env.OPENCLAW_APP_ZIP_BASE_URL ?? 'https://enchante.cloud/downloads').replace(/\/$/, '')
    return `${base}/${encodeURIComponent(zipName)}`
  })()
  const normalizedUrl = normalizeAppZipUrl(appZipUrl)
  if (normalizedUrl !== appZipUrl) {
    console.warn('[build-windows-bootstrapper] Fixed appZipUrl (asset on GitHub is OpenClaw-1.1.2-win.zip, not ...1.1.02...):')
    console.warn('  ', normalizedUrl)
    appZipUrl = normalizedUrl
  }
  if (fullOverride && expectedZip) {
    try {
      const u = new URL(fullOverride)
      const last = decodeURIComponent(u.pathname.split('/').pop() ?? '')
      if (last && last !== expectedZip && /\.zip$/i.test(last)) {
        console.warn(
          `[build-windows-bootstrapper] OPENCLAW_APP_ZIP_URL ends with "${last}" but package.json expects asset "${expectedZip}" — GitHub release asset name may 404.`
        )
      }
    } catch {
      /* ignore invalid URL */
    }
  }
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
