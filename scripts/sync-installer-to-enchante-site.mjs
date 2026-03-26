/**
 * Copies dist/OPENCLAW-setup.{exe,zip} into enchante.cloud/public/downloads/
 * so the static site serves the installer at /downloads/OPENCLAW-setup.exe
 *
 * From openclaw-enchante root: npm run sync-to-enchante-site
 *
 * Override enchante repo root: ENCHANTE_CLOUD_ROOT=D:\path\to\enchante.cloud
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const defaultEnchante = join(root, '..', 'enchante.cloud')
const enchanteRoot = (process.env.ENCHANTE_CLOUD_ROOT ?? '').trim() || defaultEnchante
const destDir = join(enchanteRoot, 'public', 'downloads')

const artifacts = ['OPENCLAW-setup.exe', 'OPENCLAW-setup.zip']

function assertSignedWindowsInstaller(pathToExe) {
  if (process.platform !== 'win32') {
    console.warn(
      '[sync-installer-to-enchante-site] skip Authenticode check (non-Windows host):',
      pathToExe
    )
    return
  }

  const psScript = [
    `$sig = Get-AuthenticodeSignature -FilePath '${pathToExe.replace(/'/g, "''")}'`,
    "if ($null -eq $sig) { exit 11 }",
    "if ($sig.Status -ne 'Valid') { exit 12 }",
    "if ($null -eq $sig.SignerCertificate) { exit 13 }",
    'Write-Output ($sig.SignerCertificate.Subject)'
  ].join('; ')

  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
    { encoding: 'utf-8' }
  )

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    console.error('[sync-installer-to-enchante-site] Refuse to publish unsigned/untrusted installer:')
    console.error(pathToExe)
    if (details) console.error(details)
    console.error(
      '[sync-installer-to-enchante-site] Build and publish the signed release artifact first (SignPath/EV).'
    )
    process.exit(1)
  }
  const signer = (result.stdout || '').trim()
  console.log('[sync-installer-to-enchante-site] verified Authenticode signature:', signer || '(unknown)')
}

function main() {
  if (!existsSync(join(enchanteRoot, 'package.json'))) {
    console.error('[sync-installer-to-enchante-site] enchante.cloud not found at:', enchanteRoot)
    console.error('Set ENCHANTE_CLOUD_ROOT to the enchante.cloud repo root.')
    process.exit(1)
  }
  mkdirSync(destDir, { recursive: true })
  let copied = 0
  for (const name of artifacts) {
    const src = join(root, 'dist', name)
    if (!existsSync(src)) {
      console.warn('[sync-installer-to-enchante-site] skip (missing):', src)
      continue
    }
    if (name.toLowerCase().endsWith('.exe')) {
      assertSignedWindowsInstaller(src)
    }
    const dest = join(destDir, name)
    copyFileSync(src, dest)
    console.log('[sync-installer-to-enchante-site] copied', name, '→', dest)
    copied += 1
  }
  if (copied === 0) {
    console.error('[sync-installer-to-enchante-site] no artifacts found. Run: npm run build:win-local')
    process.exit(1)
  }
}

main()
