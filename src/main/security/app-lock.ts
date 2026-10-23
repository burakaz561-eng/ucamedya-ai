// İsteğe bağlı uygulama kilidi (yerel parola). Parola scrypt ile tuzlanıp özetlenir; düz metin saklanmaz.
// Art arda hatalı denemelerde artan bekleme uygulanır.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { SettingsService } from '../services/settings'

export class AppLock {
  private unlocked = false
  private failures = 0
  private lockedUntil = 0

  constructor(private settings: SettingsService) {}

  enabled() {
    return this.settings.get().security.lockEnabled && !!this.settings.getValue('lock_hash')
  }

  isUnlocked() {
    return !this.enabled() || this.unlocked
  }

  setPassword(pw: string | null) {
    if (pw == null || pw === '') {
      this.settings.setValue('lock_hash', '')
      this.settings.update({ security: { ...this.settings.get().security, lockEnabled: false } })
      return
    }
    if (pw.length < 6) throw new Error('Parola en az 6 karakter olmalı')
    const salt = randomBytes(16)
    const hash = scryptSync(pw, salt, 64)
    this.settings.setValue('lock_hash', `${salt.toString('hex')}:${hash.toString('hex')}`)
    this.settings.update({ security: { ...this.settings.get().security, lockEnabled: true } })
    this.unlocked = true
  }

  unlock(pw: string): boolean {
    if (Date.now() < this.lockedUntil) throw new Error(`Çok fazla hatalı deneme. ${Math.ceil((this.lockedUntil - Date.now()) / 1000)} sn sonra tekrar deneyin.`)
    const stored = this.settings.getValue('lock_hash')
    if (!stored) return (this.unlocked = true)
    const [s, h] = stored.split(':')
    const ok = timingSafeEqual(scryptSync(pw, Buffer.from(s, 'hex'), 64), Buffer.from(h, 'hex'))
    if (ok) {
      this.failures = 0
      this.unlocked = true
    } else {
      this.failures++
      if (this.failures >= 5) this.lockedUntil = Date.now() + Math.min(300, 15 * 2 ** (this.failures - 5)) * 1000
    }
    return ok
  }

  lock() {
    this.unlocked = false
  }
}
