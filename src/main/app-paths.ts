/**
 * Resolve bundled icons for main process.
 * - Dev: project root `resources/` (from `out/main/*.js` → `../../resources`).
 * - Packaged: `extraResources` → `process.resourcesPath/app.ico` (Windows), or asar-unpacked PNG fallback.
 */
import { app, nativeImage } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const mainDir = dirname(fileURLToPath(import.meta.url))

function resolveProjectResources(...parts: string[]): string {
  return join(mainDir, '../../resources', ...parts)
}

function resolveDevBuildIconIco(): string {
  return join(mainDir, '../../build/icon.ico')
}

/**
 * Ordered icon sources. Windows dev prefers `build/icon.ico` (taskbar); packaged tries ICO then unpacked PNG
 * if Chromium fails to decode the ICO (some large multi-resolution ICOs return an empty NativeImage).
 */
function getAppIconCandidatePaths(): string[] {
  if (app.isPackaged) {
    const ico = join(process.resourcesPath, 'app.ico')
    const win256 = join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'icon-win256.png')
    const png = join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'icon.png')
    /*
     * Windows: try installer `extraResources` ICO first (same asset as .exe / shortcuts), then unpacked PNGs
     * if Chromium returns an empty NativeImage for this ICO build.
     */
    if (process.platform === 'win32') {
      return [ico, win256, png]
    }
    return [ico, png]
  }
  const devBrandIco = resolveProjectResources('openclaw-logo.ico')
  const devIco = resolveDevBuildIconIco()
  const devWin256 = resolveProjectResources('icon-win256.png')
  const devPng = resolveProjectResources('icon.png')
  if (process.platform === 'win32') {
    return [devWin256, devBrandIco, devIco, devPng]
  }
  return [devPng, devIco]
}

/** First existing ICO/PNG path (for logging / diagnostics). */
export function resolveAppIconFile(): string {
  for (const p of getAppIconCandidatePaths()) {
    if (existsSync(p)) return p
  }
  return resolveProjectResources('icon.png')
}

export function getAppIconNativeImage(): Electron.NativeImage {
  for (const p of getAppIconCandidatePaths()) {
    if (!existsSync(p)) continue
    try {
      let img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img
      /* Some Windows .ico files decode empty via createFromPath; raw buffer often works. */
      const buf = readFileSync(p)
      img = nativeImage.createFromBuffer(buf)
      if (!img.isEmpty()) return img
    } catch {
      /* invalid or unreadable image */
    }
  }
  return nativeImage.createEmpty()
}

/** macOS menu bar template (only used on darwin). */
export function resolveTrayTemplatePath(): string {
  if (app.isPackaged) {
    const unpacked = join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'trayIconTemplate.png')
    if (existsSync(unpacked)) return unpacked
    const unpacked2x = join(
      process.resourcesPath,
      'app.asar.unpacked',
      'resources',
      'trayIconTemplate@2x.png'
    )
    if (existsSync(unpacked2x)) return unpacked2x
  }
  const p = resolveProjectResources('trayIconTemplate.png')
  if (existsSync(p)) return p
  return resolveProjectResources('trayIconTemplate@2x.png')
}
