/**
 * Publishes signed Windows installer to S3-compatible storage via AWS CLI.
 *
 * Required env:
 *   S3_BUCKET=download
 *
 * Optional env:
 *   S3_KEY=windows/OPENCLAW-setup.exe
 *   S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com
 *   INSTALLER_PATH=dist/installer/OPENCLAW-setup.exe
 */
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const installerPathEnv = (process.env.INSTALLER_PATH ?? 'dist/installer/OPENCLAW-setup.exe').trim()
const installerPath = isAbsolute(installerPathEnv) ? installerPathEnv : join(root, installerPathEnv)
const bucket = (process.env.S3_BUCKET ?? '').trim()
const key = (process.env.S3_KEY ?? 'windows/OPENCLAW-setup.exe').trim()
const endpointUrl = (process.env.S3_ENDPOINT_URL ?? '').trim()

function fail(message) {
  console.error('[publish-signed-installer-s3]', message)
  process.exit(1)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf-8',
    shell: process.platform === 'win32',
    ...options
  })
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    if (details) console.error(details)
    fail(`${command} failed`)
  }
  return result
}

function assertSignedWindowsInstaller(pathToExe) {
  if (process.platform !== 'win32') {
    console.warn('[publish-signed-installer-s3] skip Authenticode check on non-Windows host')
    return
  }
  const psScript = [
    `$sig = Get-AuthenticodeSignature -FilePath '${pathToExe.replace(/'/g, "''")}'`,
    '$subject = [string]::Empty',
    'if ($null -ne $sig.SignerCertificate) { $subject = $sig.SignerCertificate.Subject }',
    "Write-Output ('STATUS=' + $sig.Status)",
    "Write-Output ('MESSAGE=' + $sig.StatusMessage)",
    "Write-Output ('SUBJECT=' + $subject)",
    "if ($null -eq $sig) { exit 11 }",
    "if ($sig.Status -ne 'Valid') { exit 12 }",
    "if ($null -eq $sig.SignerCertificate) { exit 13 }"
  ].join('; ')
  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
    { cwd: root, encoding: 'utf-8', shell: process.platform === 'win32' }
  )
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    if (details) console.error(details)
    fail(`refuse to publish unsigned/untrusted installer: ${pathToExe}`)
  }
  const details = (result.stdout || '').trim()
  const signerLine = details
    .split(/\r?\n/)
    .find((line) => line.startsWith('SUBJECT='))
    ?.slice('SUBJECT='.length)
  console.log('[publish-signed-installer-s3] verified Authenticode signature:', signerLine || '(unknown signer)')
}

function main() {
  if (!bucket) fail('missing S3_BUCKET')
  if (!existsSync(installerPath)) fail(`installer not found: ${installerPath}`)

  assertSignedWindowsInstaller(installerPath)

  const target = `s3://${bucket}/${key}`
  const args = ['s3', 'cp', installerPath, target, '--content-type', 'application/vnd.microsoft.portable-executable']
  if (endpointUrl) args.push('--endpoint-url', endpointUrl)

  console.log('[publish-signed-installer-s3] uploading:', installerPath, '->', target)
  run('aws', args)

  const headArgs = ['s3api', 'head-object', '--bucket', bucket, '--key', key]
  if (endpointUrl) headArgs.push('--endpoint-url', endpointUrl)
  run('aws', headArgs)
  console.log('[publish-signed-installer-s3] done')
}

main()
