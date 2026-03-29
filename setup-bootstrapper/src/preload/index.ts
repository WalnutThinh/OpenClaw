import { contextBridge, ipcRenderer } from 'electron'

function subscribeChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => {
    callback(payload)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('setupAPI', {
  closeWindow: (): Promise<void> => ipcRenderer.invoke('setup:close'),
  payloadInfo: (): Promise<{
    ready: boolean
    mode: 'local' | 'download' | 'none'
    remoteUrl?: string
    reason?: string
  }> => ipcRenderer.invoke('setup:payload-info'),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('setup:pick-folder'),
  install: (parentDir: string) => ipcRenderer.invoke('setup:install', parentDir),
  openPath: (p: string): Promise<string | null> => ipcRenderer.invoke('setup:open-path', p),
  reveal: (p: string): Promise<void> => ipcRenderer.invoke('setup:reveal', p),
  subscribeExtractProgress: (
    callback: (payload: { files: number; done?: boolean }) => void
  ): (() => void) => subscribeChannel('setup:extract-progress', callback),
  subscribeDownloadProgress: (
    callback: (payload: { received: number; total?: number }) => void
  ): (() => void) => subscribeChannel('setup:download-progress', callback),
  subscribeInstallPhase: (
    callback: (payload: { phase: 'download' | 'extract' }) => void
  ): (() => void) => subscribeChannel('setup:install-phase', callback)
})

declare global {
  interface Window {
    setupAPI: {
      closeWindow: () => Promise<void>
      payloadInfo: () => Promise<{
        ready: boolean
        mode: 'local' | 'download' | 'none'
        remoteUrl?: string
        reason?: string
      }>
      pickFolder: () => Promise<string | null>
      install: (parentDir: string) => Promise<
        | { ok: true; installPath: string; exePath: string }
        | { ok: false; error: string }
      >
      openPath: (p: string) => Promise<string | null>
      reveal: (p: string) => Promise<void>
      subscribeExtractProgress: (
        callback: (payload: { files: number; done?: boolean }) => void
      ) => () => void
      subscribeDownloadProgress: (
        callback: (payload: { received: number; total?: number }) => void
      ) => () => void
      subscribeInstallPhase: (callback: (payload: { phase: 'download' | 'extract' }) => void) => () => void
    }
  }
}
