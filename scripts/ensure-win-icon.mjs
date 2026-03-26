/**
 * Writes build/icon.ico from resources/icon.png so electron-builder can:
 * - embed win.icon on OpenClaw.exe
 * - copy extraResources → resources/app.ico next to the app
 *
 * Without this file, Windows builds may ship with no app.ico (generic taskbar icon).
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pngToIco = require('png-to-ico')

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const srcPng = join(root, 'resources/icon.png')
const outIco = join(root, 'build/icon.ico')

if (!existsSync(srcPng)) {
  console.error('[ensure-win-icon] missing source:', srcPng)
  process.exit(1)
}

mkdirSync(dirname(outIco), { recursive: true })
/*
 * png-to-ico: pass a single path string (not [path]). The array API embeds each file as-is;
 * a lone 512×512 PNG becomes one invalid entry for NSIS ("invalid icon file size").
 * Single-arg mode resizes to 256 and adds 48, 32, 16 — what NSIS / Windows expect.
 */
const buf = await pngToIco(srcPng)
writeFileSync(outIco, buf)
console.log('[ensure-win-icon]', srcPng, '→', outIco)
