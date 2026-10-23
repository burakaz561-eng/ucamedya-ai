// Basit dosya günlüğü. Parolalar ve API anahtarları ASLA yazılmaz:
// mesajlar uzunluk sınırlıdır ve anahtar benzeri diziler maskelenir.

import { appendFileSync, mkdirSync, renameSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

let file: string | null = null

export function initLogger(dir: string) {
  mkdirSync(dir, { recursive: true })
  file = join(dir, 'ucamedya-ai.log')
  try {
    if (existsSync(file) && statSync(file).size > 2_000_000) renameSync(file, join(dir, 'ucamedya-ai.old.log'))
  } catch {
    /* yok say */
  }
}

export function redact(s: string): string {
  return s
    .replace(/(sk-ant-[\w-]{6})[\w-]+/g, '$1…')
    .replace(/(api_key|key|token|cx|apikey|subscription-token)=([^&\s]+)/gi, '$1=***')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '***')
    .slice(0, 1000)
}

export function log(level: 'info' | 'warn' | 'error', msg: string) {
  const line = `${new Date().toISOString()} [${level}] ${redact(msg)}\n`
  if (level === 'error') console.error(line.trim())
  if (!file) return
  try {
    appendFileSync(file, line, 'utf8')
  } catch {
    /* günlük yazılamazsa uygulama çalışmaya devam eder */
  }
}
