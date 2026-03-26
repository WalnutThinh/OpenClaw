import { spawn } from 'child_process'
import { existsSync, createWriteStream, createReadStream, readFileSync, writeFileSync } from 'fs'
import { homedir, platform } from 'os'
import { join } from 'path'
import https from 'https'
import { BrowserWindow, dialog } from 'electron'
import { stopGateway, startGateway, waitUntilStopped } from './gateway'
import { runInWsl, readWslFile } from './wsl-utils'
import { t } from '../../shared/i18n/main'

const openclawDir = (): string => join(homedir(), '.openclaw')

const formatDate = (): string => {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

// ─── macOS: tar ───

const tarCreateMac = (destFile: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('tar', ['-czf', destFile, '-C', homedir(), '.openclaw'])
    child.stdout.resume()
    child.stderr.resume()
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar create failed (exit ${code})`))
    })
    child.on('error', reject)
  })

const tarExtractMac = (srcFile: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('tar', [
      '-xzf',
      srcFile,
      '-C',
      homedir(),
      '--no-same-owner',
      '--exclude=../*',
      '--exclude=*/../*'
    ])
    child.stdout.resume()
    child.stderr.resume()
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar extract failed (exit ${code})`))
    })
    child.on('error', reject)
  })

// ─── Windows: tar inside WSL ───

const tarCreateWsl = (destFile: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('wsl', [
      '-d',
      'Ubuntu',
      '-u',
      'root',
      '--',
      'tar',
      '-czf',
      '-',
      '-C',
      '/root',
      '.openclaw'
    ])
    const ws = createWriteStream(destFile)
    child.stdout.pipe(ws)
    child.stderr.resume()
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar failed (exit ${code})`))
    })
    child.on('error', reject)
    ws.on('error', reject)
  })

const tarExtractWsl = (srcFile: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const rs = createReadStream(srcFile)
    const child = spawn('wsl', [
      '-d',
      'Ubuntu',
      '-u',
      'root',
      '--',
      'tar',
      '-xzf',
      '-',
      '-C',
      '/root',
      '--no-same-owner',
      '--exclude=../*',
      '--exclude=*/../*'
    ])
    rs.pipe(child.stdin)
    child.stdout.resume()
    child.stderr.resume()
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar extract failed (exit ${code})`))
    })
    child.on('error', reject)
    rs.on('error', reject)
  })

// ─── IPv4 fix (macOS) ───

const ensureIpv4Fix = async (): Promise<void> => {
  if (platform() !== 'darwin') return
  const fixPath = join(homedir(), '.openclaw', 'ipv4-fix.js')
  if (!existsSync(fixPath)) return
  // Set NODE_OPTIONS in current session's launchd environment
  await new Promise<void>((r) => {
    const child = spawn('launchctl', ['setenv', 'NODE_OPTIONS', `--require=${fixPath}`])
    child.on('close', () => r())
    child.on('error', () => r())
  })
  // Permanently patch NODE_OPTIONS into plist
  const plist = join(homedir(), 'Library', 'LaunchAgents', 'ai.openclaw.gateway.plist')
  if (!existsSync(plist)) return
  let xml = readFileSync(plist, 'utf-8')
  if (xml.includes('NODE_OPTIONS')) return
  xml = xml.replace(
    '</dict>\n  </dict>',
    `<key>NODE_OPTIONS</key>\n    <string>--require=${fixPath}</string>\n    </dict>\n  </dict>`
  )
  writeFileSync(plist, xml)
}

// ─── Telegram long-poll cleanup ───

const clearTelegramPoll = async (): Promise<void> => {
  const isWin = platform() === 'win32'
  let raw: string | undefined
  try {
    if (isWin) {
      raw = await readWslFile('/root/.openclaw/openclaw.json')
    } else {
      const p = join(homedir(), '.openclaw', 'openclaw.json')
      if (existsSync(p)) raw = readFileSync(p, 'utf-8')
    }
  } catch {
    return
  }
  if (!raw) return

  let token: string | undefined
  try {
    token = JSON.parse(raw).channels?.telegram?.botToken
  } catch {
    return
  }
  if (!token) return

  for (let i = 0; i < 5; i++) {
    const ok = await new Promise<boolean>((resolve) => {
      https
        .get(`https://api.telegram.org/bot${token}/getUpdates?timeout=0&limit=1`, (res) => {
          let d = ''
          res.on('data', (c) => (d += c))
          res.on('end', () => {
            try {
              resolve(JSON.parse(d).ok === true)
            } catch {
              resolve(false)
            }
          })
        })
        .on('error', () => resolve(false))
    })
    if (ok) return
    await new Promise((r) => setTimeout(r, 3000))
  }
}

// ─── Export ───

export const exportBackup = async (
  win: BrowserWindow
): Promise<{ success: boolean; error?: string }> => {
  const isWin = platform() === 'win32'

  // Verify source exists
  if (!isWin && !existsSync(openclawDir())) {
    return { success: false, error: t('backup.noConfig') }
  }
  if (isWin) {
    try {
      await runInWsl('test -d /root/.openclaw', 10000)
    } catch {
      return { success: false, error: t('backup.noConfig') }
    }
  }

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: t('backup.saveTitle'),
    defaultPath: `openclaw-backup-${formatDate()}.tar.gz`,
    filters: [{ name: 'Tar Archive', extensions: ['tar.gz'] }]
  })

  if (canceled || !filePath) return { success: false, error: 'CANCELLED' }

  try {
    if (isWin) {
      await tarCreateWsl(filePath)
    } else {
      await tarCreateMac(filePath)
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export const importBackup = async (
  win: BrowserWindow
): Promise<{ success: boolean; error?: string }> => {
  const isWin = platform() === 'win32'

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: t('backup.selectTitle'),
    filters: [{ name: 'Tar Archive', extensions: ['tar.gz', 'gz'] }],
    properties: ['openFile']
  })

  if (canceled || filePaths.length === 0) return { success: false, error: 'CANCELLED' }
  const backupFile = filePaths[0]

  try {
    try {
      await stopGateway()
    } catch {
      /* already stopped */
    }

    await waitUntilStopped()

    if (isWin) {
      await tarExtractWsl(backupFile)
    } else {
      await tarExtractMac(backupFile)
    }

    // Apply IPv4 fix (launchctl setenv) + prevent Telegram long-poll 409 conflict
    await ensureIpv4Fix()
    await clearTelegramPoll()

    try {
      await startGateway()
    } catch {
      /* user can start manually */
    }

    // Re-patch since gateway install may have regenerated plist
    await ensureIpv4Fix()

    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
