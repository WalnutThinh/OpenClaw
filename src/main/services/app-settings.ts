import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

const getSettingsPath = (): string => join(app.getPath('userData'), 'settings.json')

export const readAppSettings = (): Record<string, unknown> => {
  try {
    const p = getSettingsPath()
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    /* ignore */
  }
  return {}
}

export const writeAppSettings = (patch: Record<string, unknown>): void => {
  const p = getSettingsPath()
  mkdirSync(dirname(p), { recursive: true })
  const settings = { ...readAppSettings(), ...patch }
  writeFileSync(p, JSON.stringify(settings, null, 2))
}
