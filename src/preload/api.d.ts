export {}

declare global {
  interface Window {
    api: {
      invoke<T = unknown>(channel: string, payload?: unknown): Promise<T>
      on(event: 'job' | 'data-changed' | 'notification' | 'agent' | 'outreach-confirm', cb: (payload: unknown) => void): () => void
      platform: string
    }
  }
}
