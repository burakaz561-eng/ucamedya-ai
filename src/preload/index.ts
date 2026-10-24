// Preload: arayüze yalnızca dar bir API açar. Node.js erişimi verilmez (contextIsolation + sandbox).
// Tüm çağrılar tek bir IPC kanalından geçer; komut adı ve girdi ana süreçte doğrulanır.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const EVENTS = new Set(['job', 'data-changed', 'notification', 'agent', 'outreach-confirm'])

const api = {
  invoke(channel: string, payload?: unknown): Promise<unknown> {
    if (typeof channel !== 'string' || channel.length > 64) return Promise.reject(new Error('Geçersiz komut'))
    return ipcRenderer.invoke('uca:invoke', channel, payload).then((res: { ok: boolean; data?: unknown; error?: string }) => {
      if (!res?.ok) throw new Error(res?.error ?? 'Bilinmeyen hata')
      return res.data
    })
  },
  on(event: string, cb: (payload: unknown) => void): () => void {
    if (!EVENTS.has(event)) throw new Error('Geçersiz olay')
    const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload)
    ipcRenderer.on(`uca:event:${event}`, listener)
    return () => ipcRenderer.removeListener(`uca:event:${event}`, listener)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('api', api)
