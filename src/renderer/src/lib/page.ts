import type { AppSettings } from '@shared/types'

export interface PageProps {
  params: Record<string, unknown>
  settings: AppSettings
  setSettings: (s: AppSettings) => void
}
