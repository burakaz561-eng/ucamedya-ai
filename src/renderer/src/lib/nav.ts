import { createContext, useContext } from 'react'

export type PageKey =
  | 'dashboard' | 'control' | 'finder' | 'research' | 'analysis' | 'companies' | 'communication' | 'email' | 'whatsapp' | 'studio'
  | 'offers' | 'followup' | 'reports' | 'files' | 'integrations' | 'automations' | 'settings' | 'pipeline' | 'leads'

export interface Route {
  page: PageKey
  params?: Record<string, unknown>
}

export const NavCtx = createContext<{ route: Route; go: (page: PageKey, params?: Record<string, unknown>) => void; openCompany: (id: number) => void }>({
  route: { page: 'dashboard' },
  go: () => undefined,
  openCompany: () => undefined
})
export const useNav = () => useContext(NavCtx)
