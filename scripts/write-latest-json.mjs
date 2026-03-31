/**
 * Generate dist/latest.json for launcher update flow:
 * - launcher downloads latest.json
 * - resolves zip URL + checksum
 * - download resume + verify sha256
 *
 * Env (optional):
 *   OPENCLAW_LATEST_BASE_URL   default: https://enchante.cloud/downloads
 *   OPENCLAW_LATEST_OUTPUT     default: dist/latest.json
 */
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const distDir = join(root, 'dist')

function readProductName() {
  try {
    const raw = readFileSync(join(root, 'electron-builder.yml'), 'utf8')
    const m = /^productName:\s*(.+)$/m.exec(raw)
    const name = m?.[1]?.trim()
    return name && /^[\w .-]+$/i.test(name) ? name : 'EClaw'
  } catch {
    return 'EClaw'
  }
}

function readVersion() {
  try {
    const raw = readFileSync(join(root, 'package.json'), 'utf8')
    const v = JSON.parse(raw)?.version
    return typeof v === 'string' && v.trim() ? v.trim() : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function findZip() {
  if (!existsSync(distDir)) return null
  const product = readProductName()
  const version = readVersion()
  const exact = join(distDir, `${product}-${version}-win.zip`)
  if (existsSync(exact)) return exact
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

function sha256(filePath) {
  return new Promise((resolveHash, rejectHash) => {
    const h = createHash('sha256')
    const rs = createReadStream(filePath)
    rs.on('error', rejectHash)
    rs.on('data', (chunk) => h.update(chunk))
    rs.on('end', () => resolveHash(h.digest('hex')))
  })
}

async function main() {
  const zipPath = findZip()
  if (!zipPath) {
    console.error('[write-latest-json] No app zip found in dist/. Run npm run build:win-app-zip first.')
    process.exit(1)
  }
  const zipName = basename(zipPath)
  const base = (process.env.OPENCLAW_LATEST_BASE_URL ?? 'https://enchante.cloud/downloads').replace(/\/$/, '')
  const outPath = (process.env.OPENCLAW_LATEST_OUTPUT ?? join(distDir, 'latest.json')).trim()
  const digest = await sha256(zipPath)
  const size = statSync(zipPath).size
  const payload = {
    version: readVersion(),
    channel: 'stable',
    productName: readProductName(),
    url: `${base}/${encodeURIComponent(zipName)}`,
    sha256: digest,
    size,
    publishedAt: new Date().toISOString()
  }
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  console.log('[write-latest-json] Wrote', outPath)
  console.log('[write-latest-json]   url:', payload.url)
  console.log('[write-latest-json]   sha256:', payload.sha256)
  console.log('[write-latest-json]   size:', payload.size)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

