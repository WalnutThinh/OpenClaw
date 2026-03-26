/**
 * NSIS Unicode (electron-builder) reads MUI license text as system ANSI if the file is UTF-8,
 * which mojibakes Vietnamese. Encode to UTF-16 LE with BOM — standard for NSIS Unicode.
 *
 * Edit: build/installer-license.source.txt (UTF-8)
 * Output: build/installer-license.txt (UTF-16 LE + BOM) consumed by nsis.license
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'build', 'installer-license.source.txt')
const out = join(root, 'build', 'installer-license.txt')

if (!existsSync(src)) {
  console.warn('[encode-installer-license-nsis] skip: build/installer-license.source.txt missing')
  process.exit(0)
}

const text = readFileSync(src, 'utf8').replace(/^\uFEFF/, '')
const bom = Buffer.from([0xff, 0xfe])
const body = Buffer.from(text, 'utf16le')
writeFileSync(out, Buffer.concat([bom, body]))
console.log('[encode-installer-license-nsis] wrote build/installer-license.txt (UTF-16 LE + BOM)')
