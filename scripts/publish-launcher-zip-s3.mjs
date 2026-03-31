/**
 * Upload launcher ZIP (unsigned-friendly) to S3-compatible storage.
 *
 * Required env:
 *   S3_BUCKET
 *
 * Optional env:
 *   S3_KEY=downloads/EClaw-Launcher.zip
 *   S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com
 *   LAUNCHER_ZIP_PATH=dist/installer/EClaw-Launcher.zip
 */
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const zipPathEnv = (process.env.LAUNCHER_ZIP_PATH ?? 'dist/installer/EClaw-Launcher.zip').trim()
const zipPath = isAbsolute(zipPathEnv) ? zipPathEnv : join(root, zipPathEnv)
const bucket = (process.env.S3_BUCKET ?? '').trim()
const key = (process.env.S3_KEY ?? 'downloads/EClaw-Launcher.zip').trim()
const endpointUrl = (process.env.S3_ENDPOINT_URL ?? '').trim()

function fail(msg) {
  console.error('[publish-launcher-zip-s3]', msg)
  process.exit(1)
}

function run(command, args) {
  const r = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  if (r.status !== 0) fail(`${command} failed`)
}

function main() {
  if (!bucket) fail('missing S3_BUCKET')
  if (!existsSync(zipPath)) fail(`launcher zip not found: ${zipPath}`)
  const target = `s3://${bucket}/${key}`
  const args = ['s3', 'cp', zipPath, target, '--content-type', 'application/zip']
  if (endpointUrl) args.push('--endpoint-url', endpointUrl)
  console.log('[publish-launcher-zip-s3] uploading:', zipPath, '->', target)
  run('aws', args)
  console.log('[publish-launcher-zip-s3] done')
}

main()

