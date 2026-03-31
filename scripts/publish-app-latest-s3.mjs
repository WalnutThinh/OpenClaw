/**
 * Release flow (no GitHub Release):
 * 1) Build app zip
 * 2) Upload zip via `aws s3 cp`
 * 3) Generate + upload latest.json
 *
 * Required env:
 *   S3_BUCKET
 *
 * Optional env:
 *   S3_PREFIX=downloads
 *   S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com
 *   OPENCLAW_LATEST_BASE_URL=https://enchante.cloud/downloads
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const distDir = join(root, 'dist')

function fail(msg) {
  console.error('[publish-app-latest-s3]', msg)
  process.exit(1)
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts
  })
  if (r.status !== 0) fail(`${cmd} failed`)
}

function findZip() {
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

function main() {
  const bucket = (process.env.S3_BUCKET ?? '').trim()
  if (!bucket) fail('missing S3_BUCKET')
  const prefix = (process.env.S3_PREFIX ?? 'downloads').replace(/^\/+|\/+$/g, '')
  const endpoint = (process.env.S3_ENDPOINT_URL ?? '').trim()

  run('npm', ['run', 'build:win-app-zip'])
  run('npm', ['run', 'write:latest-json'])

  const zipPath = findZip()
  if (!zipPath) fail('no app zip found in dist/')
  const zipName = basename(zipPath)
  const zipKey = `${prefix}/${zipName}`
  const latestPath = join(distDir, 'latest.json')
  if (!existsSync(latestPath)) fail('latest.json missing in dist/')

  const cpZipArgs = ['s3', 'cp', zipPath, `s3://${bucket}/${zipKey}`, '--content-type', 'application/zip']
  if (endpoint) cpZipArgs.push('--endpoint-url', endpoint)
  console.log('[publish-app-latest-s3] upload zip:', zipName)
  run('aws', cpZipArgs)

  // Ensure latest.json url points to stable public URL.
  const base = (process.env.OPENCLAW_LATEST_BASE_URL ?? 'https://enchante.cloud/downloads').replace(/\/$/, '')
  const latest = JSON.parse(readFileSync(latestPath, 'utf8'))
  latest.url = `${base}/${encodeURIComponent(zipName)}`
  writeFileSync(latestPath, JSON.stringify(latest, null, 2) + '\n', 'utf8')

  const latestKey = `${prefix}/latest.json`
  const cpLatestArgs = ['s3', 'cp', latestPath, `s3://${bucket}/${latestKey}`, '--content-type', 'application/json']
  if (endpoint) cpLatestArgs.push('--endpoint-url', endpoint)
  console.log('[publish-app-latest-s3] upload latest.json')
  run('aws', cpLatestArgs)

  console.log('[publish-app-latest-s3] done')
  console.log('[publish-app-latest-s3] latest URL should serve:', `${base}/latest.json`)
}

main()

