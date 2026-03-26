/**
 * Downloads signed installer artifact from GitHub Release into dist/.
 *
 * Usage:
 *   npm run fetch-signed-installer
 *
 * Optional env:
 *   RELEASE_TAG=v1.2.3    # default: latest release
 */
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const distDir = join(root, 'dist')
const artifactName = 'OPENCLAW-setup.exe'
const releaseTag = (process.env.RELEASE_TAG ?? '').trim()
const directDownloadUrl = (process.env.SIGNED_INSTALLER_URL ?? '').trim()

function parseRepoFromOrigin() {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd: root,
    encoding: 'utf-8',
    shell: process.platform === 'win32'
  })
  if (result.status !== 0) return null
  const url = (result.stdout || '').trim()
  if (!url) return null

  const normalized = url.replace(/\.git$/i, '')
  const match = normalized.match(/github\.com[:/]+([^/]+)\/([^/]+)$/i)
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

function fail(message) {
  throw new Error(message)
}

function runGh(args) {
  const result = spawnSync('gh', args, {
    cwd: root,
    encoding: 'utf-8',
    shell: process.platform === 'win32'
  })
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    const noGh =
      /not recognized as an internal or external command/i.test(details) ||
      /command not found/i.test(details) ||
      /ENOENT/i.test(details)
    if (noGh) return false
    if (details) console.error(details)
    fail(`gh command failed: gh ${args.join(' ')}`)
  }
  return true
}

async function fallbackDownloadWithGitHubApi(targetPath) {
  const detected = parseRepoFromOrigin()
  const owner = (process.env.GITHUB_REPO_OWNER ?? detected?.owner ?? '').trim()
  const repo = (process.env.GITHUB_REPO_NAME ?? detected?.repo ?? '').trim()
  if (!owner || !repo) {
    fail('cannot resolve GitHub owner/repo (set GITHUB_REPO_OWNER and GITHUB_REPO_NAME)')
  }
  const apiUrl = releaseTag
    ? `https://api.github.com/repos/${owner}/${repo}/releases/tags/${releaseTag}`
    : `https://api.github.com/repos/${owner}/${repo}/releases/latest`
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'openclaw-enchante-fetch-script'
  }
  const token = (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '').trim()
  if (token) headers.Authorization = `Bearer ${token}`

  if (directDownloadUrl) {
    const response = await fetch(directDownloadUrl, { headers })
    if (!response.ok || !response.body) {
      fail(`download failed (${response.status}) from SIGNED_INSTALLER_URL`)
    }
    await pipeline(response.body, createWriteStream(targetPath))
    return
  }

  const releaseResp = await fetch(apiUrl, { headers })
  if (!releaseResp.ok) {
    fail(
      `GitHub release API failed (${releaseResp.status}) for ${apiUrl}. ` +
        'Set GITHUB_REPO_OWNER/GITHUB_REPO_NAME or SIGNED_INSTALLER_URL.'
    )
  }
  const release = await releaseResp.json()
  const assets = Array.isArray(release.assets) ? release.assets : []
  const match = assets.find((a) => a?.name === artifactName)
  if (!match?.browser_download_url) {
    const knownNames = assets.map((a) => a?.name).filter(Boolean).join(', ') || '(none)'
    fail(`artifact ${artifactName} not found in release assets. Available: ${knownNames}`)
  }

  const downloadResp = await fetch(match.browser_download_url, { headers })
  if (!downloadResp.ok || !downloadResp.body) {
    fail(`artifact download failed (${downloadResp.status}) from ${match.browser_download_url}`)
  }
  await pipeline(downloadResp.body, createWriteStream(targetPath))
}

async function main() {
  if (!existsSync(join(root, 'package.json'))) {
    fail(`repo root not found: ${root}`)
  }
  mkdirSync(distDir, { recursive: true })

  const targetPath = join(distDir, artifactName)
  rmSync(targetPath, { force: true })

  const args = ['release', 'download']
  if (releaseTag) args.push(releaseTag)
  else args.push('--latest')
  args.push('--pattern', artifactName, '--dir', distDir, '--clobber')

  console.log(
    '[fetch-signed-release-artifact] downloading',
    artifactName,
    releaseTag ? `from ${releaseTag}` : 'from latest release'
  )
  const usedGh = runGh(args)
  if (!usedGh) {
    console.warn(
      '[fetch-signed-release-artifact] gh CLI not found, using GitHub API download fallback'
    )
    await fallbackDownloadWithGitHubApi(targetPath)
  }

  if (!existsSync(targetPath)) {
    fail(`download completed but file is missing: ${targetPath}`)
  }
  console.log('[fetch-signed-release-artifact] ready:', targetPath)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error('[fetch-signed-release-artifact]', message)
  process.exitCode = 1
})
