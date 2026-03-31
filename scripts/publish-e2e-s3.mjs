/**
 * End-to-end AWS/R2 release pipeline:
 * 1) build app zip + latest.json
 * 2) upload zip + latest.json
 * 3) build launcher (OPENCLAW-setup.exe) with latest.json URL
 * 4) upload launcher:
 *    - signed EXE by default
 *    - or ZIP wrapper when ALLOW_UNSIGNED_SETUP_ZIP=1
 *
 * Required env:
 *   S3_BUCKET
 *
 * Optional env:
 *   S3_PREFIX=downloads
 *   S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com
 *   OPENCLAW_LATEST_BASE_URL=https://enchante.cloud/downloads
 *   OPENCLAW_LATEST_JSON_URL=https://enchante.cloud/downloads/latest.json
 *   S3_SETUP_KEY=downloads/EClaw-Launcher.exe
 *   ALLOW_UNSIGNED_SETUP_ZIP=1
 *   S3_SETUP_ZIP_KEY=downloads/EClaw-Launcher.zip
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function fail(msg) {
  console.error('[publish-e2e-s3]', msg)
  process.exit(1)
}

function run(command, args, env = process.env) {
  const r = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env
  })
  if (r.status !== 0) fail(`${command} ${args.join(' ')} failed`)
}

function main() {
  const bucket = (process.env.S3_BUCKET ?? '').trim()
  if (!bucket) fail('missing S3_BUCKET')

  const prefix = (process.env.S3_PREFIX ?? 'downloads').replace(/^\/+|\/+$/g, '')
  const latestBase = (process.env.OPENCLAW_LATEST_BASE_URL ?? 'https://enchante.cloud/downloads').replace(/\/$/, '')
  const latestJsonUrl = (process.env.OPENCLAW_LATEST_JSON_URL ?? `${latestBase}/latest.json`).trim()
  const setupKey = (process.env.S3_SETUP_KEY ?? `${prefix}/EClaw-Launcher.exe`).replace(/^\/+/, '')
  const setupZipKey = (process.env.S3_SETUP_ZIP_KEY ?? `${prefix}/EClaw-Launcher.zip`).replace(/^\/+/, '')
  const allowUnsignedZip = (process.env.ALLOW_UNSIGNED_SETUP_ZIP ?? '').trim() === '1'

  // Step 1 + 2: app zip + latest.json published.
  run('npm', ['run', 'publish:app-latest-s3'], {
    ...process.env,
    OPENCLAW_LATEST_BASE_URL: latestBase
  })

  // Step 3: build launcher with baked latest.json URL.
  run('npm', ['run', 'build:win-setup'], {
    ...process.env,
    OPENCLAW_LATEST_JSON_URL: latestJsonUrl
  })

  // Step 4: upload launcher artifact.
  if (allowUnsignedZip) {
    run('npm', ['run', 'package:launcher-zip'])
    run('npm', ['run', 'publish:launcher-zip-s3'], {
      ...process.env,
      S3_BUCKET: bucket,
      S3_KEY: setupZipKey
    })
  } else {
    run('npm', ['run', 'publish-signed-installer-s3'], {
      ...process.env,
      S3_BUCKET: bucket,
      S3_KEY: setupKey
    })
  }

  console.log('[publish-e2e-s3] done')
  console.log('[publish-e2e-s3] latest.json:', latestJsonUrl)
  console.log('[publish-e2e-s3] setup key:', allowUnsignedZip ? setupZipKey : setupKey)
}

main()

