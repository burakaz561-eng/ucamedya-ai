// Filtrelenebilir tablo: sütun görünürlüğü, sürükleyerek genişlik ayarı, sıralama, çoklu seçim.
// Görünürlük ve genişlik tercihleri tablo başına yerel olarak hatırlanır.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Columns3 } from 'lucide-react'
import { Btn } from './ui'

export interface Col<T> {
  key: string
  header: string
  width?: number
  render?: (row: T) => ReactNode
  sortValue?: (row: T) => string | number | null
  hidden?: boolean
  wrap?: boolean
}

function loadPrefs(id: string) {
  try {
    return JSON.parse(localStorage.getItem(`dt:${id}`) ?? '{}') as { hidden?: string[]; widths?: Record<string, number> }
  } catch {
    return {}
  }
}

export function DataTable<T extends { id: number | string }>({
  id, cols, rows, selectable, selected, onSelect, onRowClick, empty, height, toolbar
}: {
  id: string
  cols: Col<T>[]
  rows: T[]
  selectable?: boolean
  selected?: Set<T['id']>
  onSelect?: (s: Set<T['id']>) => void
  onRowClick?: (r: T) => void
  empty?: ReactNode
  height?: number | string
  toolbar?: ReactNode
}) {
  const prefs = useMemo(() => loadPrefs(id), [id])
  const [hidden, setHidden] = useState<string[]>(prefs.hidden ?? cols.filter((c) => c.hidden).map((c) => c.key))
  const [widths, setWidths] = useState<Record<string, number>>(prefs.widths ?? {})
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [menu, setMenu] = useState(false)
  const drag = useRef<{ key: string; x: number; w: number } | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(`dt:${id}`, JSON.stringify({ hidden, widths }))
    } catch {
      /* yok say */
    }
  }, [id, hidden, widths])

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return
      const d = drag.current
      setWidths((w) => ({ ...w, [d.key]: Math.max(60, d.w + e.clientX - d.x) }))
    }
    const up = () => (drag.current = null)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [])

  const visible = cols.filter((c) => !hidden.includes(c.key))
  const sorted = useMemo(() => {
    if (!sort) return rows
    const c = cols.find((x) => x.key === sort.key)
    const val = (r: T) => (c?.sortValue ? c.sortValue(r) : ((r as Record<string, unknown>)[sort.key] as string | number | null))
    return [...rows].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      if (va == null) return 1
      if (vb == null) return -1
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'tr')) * sort.dir
    })
  }, [rows, sort, cols])

  const all = selected && rows.length > 0 && rows.every((r) => selected.has(r.id))
  return (
    <div>
      <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', position: 'relative' }}>
        {toolbar}
        <div className="spacer" />
        <span className="muted small">{rows.length} kayıt{selected?.size ? ` · ${selected.size} seçili` : ''}</span>
        <Btn size="sm" variant="ghost" icon={<Columns3 />} onClick={() => setMenu((m) => !m)} aria-label="Sütunlar" title="Sütunları göster/gizle" />
        {menu && (
          <div className="card" style={{ position: 'absolute', right: 10, top: 42, zIndex: 10, padding: 10, minWidth: 220, boxShadow: 'var(--shadow-3)' }} onMouseLeave={() => setMenu(false)}>
            <div className="tiny muted" style={{ marginBottom: 6 }}>Görünen sütunlar</div>
            {cols.map((c) => (
              <label key={c.key} className="check small" style={{ padding: '3px 0' }}>
                <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => setHidden((h) => (h.includes(c.key) ? h.filter((x) => x !== c.key) : [...h, c.key]))} />
                {c.header || c.key}
              </label>
            ))}
            <Btn size="sm" variant="ghost" onClick={() => (setHidden([]), setWidths({}))}>
              Varsayılana dön
            </Btn>
          </div>
        )}
      </div>
      <div className="table-wrap" style={{ maxHeight: height ?? 'calc(100vh - 290px)' }}>
        <table className="dt">
          <colgroup>
            {selectable && <col style={{ width: 40 }} />}
            {visible.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] ?? c.width ?? 160 }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {selectable && (
                <th>
                  <input type="checkbox" aria-label="Tümünü seç" checked={!!all} onChange={() => onSelect?.(all ? new Set() : new Set(rows.map((r) => r.id)))} style={{ accentColor: 'var(--brand)' }} />
                </th>
              )}
              {visible.map((c) => (
                <th key={c.key} className="sortable" style={{ position: 'sticky' }} onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}>
                  {c.header}
                  {sort?.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                  <span
                    className="rs"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      drag.current = { key: c.key, x: e.clientX, w: widths[c.key] ?? c.width ?? 160 }
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className={`${selected?.has(r.id) ? 'sel' : ''} ${onRowClick ? 'clickable' : ''}`} onClick={() => onRowClick?.(r)}>
                {selectable && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label="Seç"
                      checked={!!selected?.has(r.id)}
                      style={{ accentColor: 'var(--brand)' }}
                      onChange={() => {
                        const s = new Set(selected)
                        if (s.has(r.id)) s.delete(r.id)
                        else s.add(r.id)
                        onSelect?.(s)
                      }}
                    />
                  </td>
                )}
                {visible.map((c) => (
                  <td key={c.key} className={c.wrap ? 'wrap' : ''}>
                    {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div style={{ padding: 10 }}>{empty}</div>}
      </div>
    </div>
  )
}
