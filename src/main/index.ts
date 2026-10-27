// UcaMedya AI Growth Studio — Electron ana süreç.

import { app, BrowserWindow, Menu, Notification, nativeTheme, safeStorage, session, shell } from 'electron'
import { join } from 'node:path'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { AppServices } from './services/app-services'
import { registerIpc } from './ipc'
import { initLogger, log } from './logger'
import { isOpenableUrl } from './http/url-safety'
import { closeBrowser } from './analysis/browser'
import { APP_NAME } from '@shared/constants'

if (process.env.UCAMEDYA_USER_DATA) app.setPath('userData', process.env.UCAMEDYA_USER_DATA)
app.setName(APP_NAME)
app.setAppUserModelId('com.ucamedya.aigrowthstudio')

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let mainWindow: BrowserWindow | null = null
let services: AppServices
const timers: NodeJS.Timeout[] = []
const DEV_URL = process.env.ELECTRON_RENDERER_URL
const iconPath = () => (app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../resources/icon.png'))

function send(event: string, payload: unknown) {
  mainWindow?.webContents.send(`uca:event:${event}`, payload)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: APP_NAME,
    icon: existsSync(iconPath()) ? iconPath() : undefined,
    backgroundColor: '#0E0E10',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged
    }
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isOpenableUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const trusted = (DEV_URL && url.startsWith(DEV_URL)) || url.startsWith('file://')
    if (!trusted) {
      e.preventDefault()
      if (isOpenableUrl(url)) void shell.openExternal(url)
    }
  })
  if (DEV_URL) void mainWindow.loadURL(DEV_URL)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  mainWindow.on('closed', () => (mainWindow = null))
}

function restartWithDatabase(file?: string) {
  const dbPath = services.db.path
  services.close()
  if (file) {
    for (const ext of ['-wal', '-shm']) rmSync(dbPath + ext, { force: true })
    copyFileSync(file, dbPath)
    log('info', `Yedekten geri yüklendi: ${file}`)
  }
  app.relaunch()
  app.exit(0)
}

function startSchedulers() {
  // Ekip modu: oturum varsa eşitleme döngüsü başlar (çevrimdışıysa önbellekle çalışılır)
  if (services.team.active()) {
    services.team.start()
    void services.team.check().then(() => services.team.syncNow())
  }
  timers.push(setTimeout(() => void services.oneTimeDraftRefresh(), 5_000))
  // Hatırlatıcılar (dakikada bir)
  timers.push(
    setInterval(() => {
      try {
        for (const r of services.offers.dueReminders()) {
          if (Notification.isSupported()) new Notification({ title: 'Hatırlatıcı', body: `${r.title}${r.company_name ? ` — ${r.company_name}` : ''}` }).show()
          send('notification', { kind: 'reminder', title: r.title, company: r.company_name })
        }
      } catch (e) {
        log('warn', `Hatırlatıcı kontrolü: ${(e as Error).message}`)
      }
    }, 60_000)
  )
  // Otomatik yedek (saatte bir kontrol)
  const backupTick = () => {
    const b = services.settings.get().backup
    if (!b.auto || !services.settings.get().setupCompleted) return
    const last = services.backups.lastAuto()
    if (!last || Date.now() - new Date(last).getTime() > b.intervalHours * 3600_000) services.jobs.enqueue('backup', 'Otomatik yedek', { kind: 'auto' })
  }
  timers.push(setTimeout(backupTick, 90_000), setInterval(backupTick, 3600_000))
  // Web sitesi talepleri (UcaMedya Bağlantı eklentisi): ayarlanan aralıkla
  let leadsBusy = false
  let leadsLast = 0
  timers.push(
    setInterval(async () => {
      const w = services.settings.get().website
      if (!w.enabled || !w.siteUrl || leadsBusy || Date.now() - leadsLast < w.syncMinutes * 60_000) return
      leadsBusy = true
      leadsLast = Date.now()
      try {
        const r = await services.leads.sync()
        if (r.imported) {
          const body = r.imported === 1 ? r.items[0].title : `${r.imported} yeni talep (${r.created} yeni müşteri, ${r.matched} mevcut müşteriyle eşleşti)`
          if (Notification.isSupported()) new Notification({ title: 'Web sitesinden yeni talep', body }).show()
          send('notification', { kind: 'lead', title: 'Web sitesinden yeni talep', company: body })
          send('data-changed', { scope: 'companies' })
        }
      } catch (e) {
        log('warn', `Web sitesi talepleri alınamadı: ${(e as Error).message}`)
      } finally {
        leadsBusy = false
      }
    }, 30_000)
  )
  // E-posta yanıtları (30 dakikada bir, yalnızca doğrulanmış IMAP hesabı varsa)
  timers.push(
    setInterval(() => {
      if (services.db.get("SELECT 1 FROM email_accounts WHERE status = 'ok' AND imap_host IS NOT NULL") && services.db.get("SELECT 1 FROM outreach_messages WHERE channel = 'email' AND status = 'sent'"))
        services.jobs.enqueue('reply_sync', 'E-posta yanıtlarını kontrol et (otomatik)', {})
    }, 30 * 60_000)
  )
}

app.whenReady().then(() => {
  initLogger(join(app.getPath('userData'), 'logs'))
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null)
  // Uygulama kendi arayüzü dışında hiçbir izin (kamera, mikrofon, konum…) istemez
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    if (!details.url.startsWith('file://') && !(DEV_URL && details.url.startsWith(DEV_URL))) return cb({})
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [DEV_URL ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws:; img-src 'self' data: blob:" : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'"]
      }
    })
  })
  try {
    services = new AppServices(
      { userData: app.getPath('userData'), documents: app.getPath('documents') },
      { available: () => safeStorage.isEncryptionAvailable(), encrypt: (s) => safeStorage.encryptString(s), decrypt: (b) => safeStorage.decryptString(b) },
      send
    )
  } catch (e) {
    log('error', `Başlatma hatası: ${(e as Error).message}`)
    const { dialog } = require('electron') as typeof import('electron')
    dialog.showErrorBox(APP_NAME, `Uygulama başlatılamadı:\n${(e as Error).message}\n\nGünlük: ${join(app.getPath('userData'), 'logs')}`)
    app.exit(1)
    return
  }
  const interrupted = services.jobs.recoverInterrupted()
  services.outreach.recover()
  if (interrupted) log('info', `${interrupted} yarım kalan görev "yarıda kaldı" olarak işaretlendi`)
  registerIpc(services, () => mainWindow, restartWithDatabase)
  nativeTheme.themeSource = services.settings.get().theme
  createWindow()
  startSchedulers()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  timers.forEach((t) => clearInterval(t))
  void closeBrowser()
  services?.close()
})
