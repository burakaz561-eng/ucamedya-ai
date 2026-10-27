// WhatsApp masaüstü uygulamasına panodaki görseli yapıştırma (Ctrl+V / Cmd+V).
//
// WhatsApp, başka uygulamaların sohbete dosya eklemesine izin vermez; whatsapp:// bağlantısı yalnızca metin taşır.
// Bu yüzden sohbet açıldıktan sonra WhatsApp penceresi öne alınır ve klavyeden "yapıştır" gönderilir: WhatsApp
// görsel önizlemesini açar ve kutudaki metni görselin açıklamasına taşır. GÖNDERME tuşuna (Enter) kullanıcı basar.
//
// Güvenlik: tuş yalnızca WhatsApp masaüstü penceresi bulunup öne alınabildiyse gönderilir; tarayıcı pencereleri
// (WhatsApp Web) hariç tutulur. Bulunamazsa hiçbir tuş gönderilmez ve kullanıcıya elle yapıştırması söylenir.

import { execFile } from 'node:child_process'

const run = (cmd: string, args: string[], timeoutMs = 15000) =>
  new Promise<{ code: number; out: string }>((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof (err as NodeJS.ErrnoException).code === 'number' ? Number((err as NodeJS.ErrnoException).code) : 1) : 0, out: `${stdout}${stderr}`.trim() })
    })
  })

// Öndeki pencere WhatsApp'a ait DEĞİLSE tuş gönderilmez (Windows odak kilidi AppActivate'i sessizce boşa çıkarabilir).
// Tuş, WScript SendKeys yerine gerçek klavye olayı (keybd_event) ile gönderilir; WhatsApp'ın WebView tabanlı yazma alanı bunu algılar.
const WIN_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class UcaWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static uint FgPid() { uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid); return pid; }
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  // Windows odak kilidi: öndeki pencerenin iş parçacığına geçici bağlanarak hedef pencere öne alınır
  public static void Focus(IntPtr h) {
    uint pid; uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), out pid);
    uint me = GetCurrentThreadId();
    AttachThreadInput(me, fgThread, true);
    if (IsIconic(h)) ShowWindow(h, 9);
    BringWindowToTop(h); SetForegroundWindow(h);
    AttachThreadInput(me, fgThread, false);
  }
  public static void CtrlV() { keybd_event(0x11,0,0,UIntPtr.Zero); keybd_event(0x56,0,0,UIntPtr.Zero); keybd_event(0x56,0,2,UIntPtr.Zero); keybd_event(0x11,0,2,UIntPtr.Zero); }
}
'@
$t0 = [Diagnostics.Stopwatch]::StartNew()
$find = { Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like 'WhatsApp*' -and $_.ProcessName -notmatch '^(chrome|msedge|firefox|opera|brave|vivaldi|UcaMedya.*)$' } | Select-Object -First 1 }
# Sohbet geçişi için en az MIN ms beklenir (önceki sohbete yapıştırmamak için), sonra WhatsApp'ın öne gelmesi yoklanır
while ($t0.ElapsedMilliseconds -lt __MIN__) { Start-Sleep -Milliseconds 50 }
$p = & $find
while ((-not $p -or [UcaWin]::FgPid() -ne [uint32]$p.Id) -and $t0.ElapsedMilliseconds -lt (__MIN__ + 6000)) { Start-Sleep -Milliseconds 150; $p = & $find }
if (-not $p) { Write-Output 'NOWINDOW'; exit 2 }
if ([UcaWin]::FgPid() -ne [uint32]$p.Id) {
  [UcaWin]::Focus($p.MainWindowHandle)
  Start-Sleep -Milliseconds 500
  if ([UcaWin]::FgPid() -ne [uint32]$p.Id) { $ws = New-Object -ComObject WScript.Shell; [void]$ws.AppActivate($p.Id); Start-Sleep -Milliseconds 500 }
}
if ([UcaWin]::FgPid() -ne [uint32]$p.Id) { Write-Output 'NOFOCUS'; exit 3 }
Start-Sleep -Milliseconds 600
if ([UcaWin]::FgPid() -ne [uint32]$p.Id) { Write-Output 'NOFOCUS'; exit 3 }
[UcaWin]::CtrlV()
Write-Output 'OK'
`

const MAC_SCRIPT = [
  'tell application "System Events"',
  '  if not (exists process "WhatsApp") then return "NOWINDOW"',
  'end tell',
  'delay 2.8',
  'tell application "WhatsApp" to activate',
  'delay 0.4',
  'tell application "System Events" to set fg to name of first application process whose frontmost is true',
  'if fg is not "WhatsApp" then return "NOFOCUS"',
  'tell application "System Events" to keystroke "v" using command down',
  'return "OK"'
]

export type PasteResult = { ok: true } | { ok: false; reason: string }

/** Betik çıktısında ayrı bir "OK" satırı var mı (önünde/arkasında başka kayıtlar olabilir) */
export function isOk(out: string): boolean {
  return out.split(/\r?\n/).some((l) => l.trim() === 'OK')
}

/**
 * Sohbeti açmadan HEMEN ÖNCE çağrılır: yapıştırma aracı (PowerShell + derleme) sohbet açılırken hazırlanır,
 * sohbet geçişi için en az minDelayMs beklenir, WhatsApp öne gelir gelmez yapıştırılır. Dönen söz, sonucu verir.
 * Not: 1,3 sn çok kısaydı — WhatsApp yeni sohbete geçmeden yapıştırılan görsel sohbet değişince kayboluyordu.
 */
export function startPasteIntoWhatsApp(minDelayMs = 3000): Promise<PasteResult> {
  return pasteIntoWhatsApp(minDelayMs)
}

async function pasteIntoWhatsApp(minDelayMs: number): Promise<PasteResult> {
  if (process.platform === 'win32') {
    // EncodedCommand: betikteki tırnak işaretleri komut satırında bozulmaz
    const script = WIN_SCRIPT.split('__MIN__').join(String(Math.max(800, Math.round(minDelayMs))))
    const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], 20000)
    // Çıktıda PowerShell ilerleme kayıtları (CLIXML) olabilir: sonda değil, ayrı bir OK satırı aranır
    if (isOk(r.out)) return { ok: true }
    return { ok: false, reason: /NOWINDOW/.test(r.out) ? 'WhatsApp masaüstü penceresi bulunamadı' : /NOFOCUS/.test(r.out) ? 'WhatsApp penceresi öne alınamadı; başka bir pencereye tuş gönderilmedi' : `yapıştırılamadı (${r.out.slice(0, 120)})` }
  }
  if (process.platform === 'darwin') {
    const r = await run('osascript', MAC_SCRIPT.flatMap((l) => ['-e', l]))
    if (isOk(r.out)) return { ok: true }
    if (/NOWINDOW/.test(r.out)) return { ok: false, reason: 'WhatsApp uygulaması açık değil' }
    if (/NOFOCUS/.test(r.out)) return { ok: false, reason: 'WhatsApp öne alınamadı; başka bir pencereye tuş gönderilmedi' }
    if (/not allowed|1002|assistive/i.test(r.out)) return { ok: false, reason: 'macOS izni gerekli: Sistem Ayarları → Gizlilik ve Güvenlik → Erişilebilirlik → UcaMedya AI Growth Studio' }
    return { ok: false, reason: `yapıştırılamadı (${r.out.slice(0, 120)})` }
  }
  return { ok: false, reason: 'bu işletim sisteminde desteklenmiyor' }
}
