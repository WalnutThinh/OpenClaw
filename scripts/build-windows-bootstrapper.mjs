/**
 * Builds the small Windows installer at ../dist/installer/OPENCLAW-setup.exe (~Electron UI only).
 * Writes build/install-manifest.json with latest.json URL + fallback zip URL.
 *
 * Env (optional):
 *   OPENCLAW_LATEST_JSON_URL — URL to latest.json (default: https://enchante.cloud/downloads/latest.json)
 *   OPENCLAW_APP_ZIP_URL     — full URL to the zip (fallback; overrides base + basename)
 *   OPENCLAW_APP_ZIP_BASE_URL — default https://enchante.cloud/downloads
 *
 * Copies dist app zip → setup-bootstrapper/payload/openclaw-app.zip for local `npm run dev`
 * (best-effort; skipped if Windows locks the zip — portable .exe still uses manifest URL only).
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

/** Matches `electron-builder.yml` `productName` (Windows zip basename prefix). */
function readElectronBuilderProductName() {
  try {
    const raw = readFileSync(join(root, 'electron-builder.yml'), 'utf8')
    const m = /^productName:\s*(.+)$/m.exec(raw)
    const name = m?.[1]?.trim()
    return name && /^[\w .-]+$/i.test(name) ? name : 'EClaw'
  } catch {
    return 'EClaw'
  }
}

/**
 * Normalize GitHub zip URL into a tagless scheme:
 * - input: https://github.com/OWNER/REPO/releases/download/<tag>/<asset>
 * - output: github-release-asset://OWNER/REPO/<asset>
 *
 * This keeps our semver filenames canonical (no leading-zero patch) while still
 * handling providers whose GitHub tag may differ (e.g. patch segment padded).
 */
function toGithubReleaseAssetScheme(url) {
  try {
    const u = new URL(url)
    if (u.hostname !== 'github.com') return url
    const parts = u.pathname.split('/').filter(Boolean)
    const d = parts.indexOf('download')
    if (d < 0 || parts.length < d + 2) return url
    const owner = parts[0]
    const repo = parts[1]
    // Expected structure: OWNER/REPO/releases/download/<tag>/<asset>
    // Index of <asset> is d + 2
    const assetName = parts[d + 2]
    if (!owner || !repo || !assetName) return url
    return `github-release-asset://${owner}/${repo}/${assetName}`
  } catch {
    return url
  }
}

// Legacy: patch segment accidentally written as 0z → z (any product prefix, e.g. EClaw / OpenClaw).
function normalizeAppZipUrl(url) {
  try {
    const u = new URL(url)
    if (u.hostname !== 'github.com') return url
    const parts = u.pathname.split('/').filter(Boolean)
    const d = parts.indexOf('download')
    if (d < 0 || parts.length < d + 3) return url
    const file = parts[d + 2]
    const m = /^([\w.-]+)-(\d+)\.(\d+)\.0(\d+)-win\.zip$/i.exec(file)
    if (!m) return url
    const fixed = `${m[1]}-${m[2]}.${m[3]}.${m[4]}-win.zip`
    if (fixed === file) return url
    parts[d + 2] = fixed
    u.pathname = `/${parts.join('/')}`
    return u.toString()
  } catch {
    /* ignore */
  }
  return url
}

function findWinAppZip() {
  if (!existsSync(distDir)) return null
  const pkgVersion = readRootPackageVersion()
  const product = readElectronBuilderProductName()
  if (pkgVersion) {
    const exact = join(distDir, `${product}-${pkgVersion}-win.zip`)
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
  const product = readElectronBuilderProductName()
  const expectedZip = pkgVersion ? `${product}-${pkgVersion}-win.zip` : null
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
  const latestJsonUrl = (process.env.OPENCLAW_LATEST_JSON_URL ?? 'https://enchante.cloud/downloads/latest.json').trim()
  let appZipUrl = fullOverride || (() => {
    const base = (process.env.OPENCLAW_APP_ZIP_BASE_URL ?? 'https://enchante.cloud/downloads').replace(/\/$/, '')
    return `${base}/${encodeURIComponent(zipName)}`
  })()
  appZipUrl = normalizeAppZipUrl(appZipUrl)
  appZipUrl = toGithubReleaseAssetScheme(appZipUrl)
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
  const manifest = {
    latestJsonUrl,
    appZipUrl
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log('[build-windows-bootstrapper] Wrote', manifestPath)
  console.log('[build-windows-bootstrapper]   latestJsonUrl:', latestJsonUrl)
  console.log('[build-windows-bootstrapper]   appZipUrl:', appZipUrl)
  console.log(
    '[build-windows-bootstrapper] Publish latest.json + zip before distributing OPENCLAW-setup.exe.'
  )
}

function copyPayloadForDev(zipPath) {
  mkdirSync(payloadDir, { recursive: true })
  try {
    copyFileSync(zipPath, payloadZip)
    console.log('[build-windows-bootstrapper] Dev payload:', zipPath, '→', payloadZip)
  } catch (e) {
    if (e?.code === 'EBUSY' || e?.code === 'EPERM') {
      console.warn(
        '[build-windows-bootstrapper] Skipped payload copy (file locked). ' +
          'Installer still uses install-manifest.json; for local `setup-bootstrapper` dev, copy the zip manually or retry.'
      )
      return
    }
    throw e
  }
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
  console.log('[build-windows-bootstrapper] Done. Small installer: dist/installer/EClaw-Launcher.exe')
}

main()
