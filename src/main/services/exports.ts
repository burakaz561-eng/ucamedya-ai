// CSV ve Excel dışa aktarma.

import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'

export interface Column {
  key: string
  header: string
  width?: number
}

function csvCell(v: unknown): string {
  if (v == null) return ''
  let s = String(v)
  // Excel formül enjeksiyonuna karşı koruma
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function writeCsv(path: string, cols: Column[], rows: Record<string, unknown>[]) {
  const lines = [cols.map((c) => csvCell(c.header)).join(';'), ...rows.map((r) => cols.map((c) => csvCell(r[c.key])).join(';'))]
  writeFileSync(path, '﻿' + lines.join('\r\n'), 'utf8')
}

export async function writeXlsx(path: string, sheets: { name: string; cols: Column[]; rows: Record<string, unknown>[] }[]) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'UcaMedya AI Growth Studio'
  wb.created = new Date()
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31))
    ws.columns = sh.cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }))
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE95A1B' } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    for (const r of sh.rows) {
      const clean: Record<string, unknown> = {}
      for (const c of sh.cols) {
        const v = r[c.key]
        clean[c.key] = typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v
      }
      ws.addRow(clean)
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sh.cols.length } }
  }
  await wb.xlsx.writeFile(path)
}

export const COMPANY_COLUMNS: Column[] = [
  { key: 'id', header: 'No', width: 7 },
  { key: 'name', header: 'Şirket', width: 34 },
  { key: 'sector', header: 'Sektör' },
  { key: 'city', header: 'İl' },
  { key: 'district', header: 'İlçe' },
  { key: 'website', header: 'Web sitesi', width: 32 },
  { key: 'website_status', header: 'Site durumu' },
  { key: 'email', header: 'E-posta', width: 28 },
  { key: 'phone', header: 'Telefon' },
  { key: 'opportunity_score', header: 'Fırsat puanı', width: 12 },
  { key: 'priority_group', header: 'Grup' },
  { key: 'stage_label', header: 'Aşama' },
  { key: 'analysis_summary', header: 'Analiz özeti', width: 60 },
  { key: 'tags', header: 'Etiketler' },
  { key: 'owner', header: 'Sorumlu' },
  { key: 'next_action', header: 'Sonraki işlem' },
  { key: 'last_analysis_at', header: 'Son analiz' },
  { key: 'created_at', header: 'Eklenme' }
]
