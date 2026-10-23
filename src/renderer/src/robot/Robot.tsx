// Robot bileşeni: WebGL varsa 3D (Three.js), yoksa veya hafif mod / azaltılmış hareket seçiliyse SVG.
// Görünmezken (sekme arka planda / bileşen ekranda değil) çizim döngüsü durur; bellek bırakılır.

import { useEffect, useRef, useState, createContext, useContext } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildRobot, animateRobot, type RobotMood } from './robot-model'
import logoUrl from '../assets/uca-medya-logo-light.png'

export const RobotPrefs = createContext<{ animations: boolean; light: boolean }>({ animations: true, light: false })

let webglOk: boolean | null = null
function hasWebGL() {
  if (webglOk != null) return webglOk
  try {
    const c = document.createElement('canvas')
    webglOk = !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    webglOk = false
  }
  return webglOk
}

export function Robot({ mood = 'idle', size = 160, camera = 'portrait', onReady, className, forceStatic }: { mood?: RobotMood; size?: number | string; camera?: 'portrait' | 'cinematic'; onReady?: () => void; className?: string; forceStatic?: boolean }) {
  const prefs = useContext(RobotPrefs)
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const use3d = !forceStatic && !prefs.light && hasWebGL()
  if (!use3d) return <RobotSvg mood={mood} size={size} animate={prefs.animations && !reduced} className={className} />
  return <Robot3D mood={prefs.animations && !reduced ? mood : 'idle'} size={size} camera={camera} onReady={onReady} className={className} still={!prefs.animations || !!reduced} />
}

function Robot3D({ mood, size, camera, onReady, className, still }: { mood: RobotMood; size: number | string; camera: 'portrait' | 'cinematic'; onReady?: () => void; className?: string; still: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const moodRef = useRef<{ mood: RobotMood; at: number }>({ mood, at: performance.now() })
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    moodRef.current = { mood, at: performance.now() }
  }, [mood])

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      setFailed(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTex
    const cam = new THREE.PerspectiveCamera(camera === 'cinematic' ? 30 : 28, 1, 0.1, 100)
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(3, 5, 4)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xe95a1b, camera === 'cinematic' ? 3.2 : 1.6)
    rim.position.set(-4, 2, -3)
    scene.add(rim)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a1a12, 0.5))
    const shadowPlane = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), new THREE.ShadowMaterial({ opacity: 0.25 }))
    shadowPlane.rotation.x = -Math.PI / 2
    shadowPlane.position.y = -1.36
    shadowPlane.receiveShadow = true
    scene.add(shadowPlane)

    let rig: ReturnType<typeof buildRobot> | null = null
    let disposed = false
    new THREE.TextureLoader().load(
      logoUrl,
      (tex) => {
        if (disposed) return tex.dispose()
        rig = buildRobot(tex)
        scene.add(rig.root)
        onReady?.()
      },
      undefined,
      () => {
        if (disposed) return
        rig = buildRobot(null)
        scene.add(rig.root)
        onReady?.()
      }
    )

    const resize = () => {
      const w = el.clientWidth || 160
      const h = el.clientHeight || 160
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      cam.aspect = w / h
      cam.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    let visible = true
    const io = new IntersectionObserver((e) => (visible = e[0]?.isIntersecting ?? true))
    io.observe(el)

    const start = performance.now()
    let raf = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
      if (document.hidden || !visible || !rig) return
      const now = performance.now()
      const t = still ? 0 : (now - start) / 1000
      const mt = (now - moodRef.current.at) / 1000
      animateRobot(rig, moodRef.current.mood, t, mt)
      if (camera === 'cinematic') {
        // Kontrollü kamera hareketi: uzaktan ve yandan yaklaşarak robotun karşısına yerleşir (≈2,6 sn)
        const k = Math.min(1, (now - start) / 2600)
        const e = 1 - Math.pow(1 - k, 3)
        const ang = (1 - e) * 1.25
        const dist = 11.5 - e * 2.6
        cam.position.set(Math.sin(ang) * dist, 1.3 + (1 - e) * 1.6, Math.cos(ang) * dist)
        cam.lookAt(0, 0.75, 0)
        rig.root.rotation.y = (1 - e) * -0.9
      } else {
        cam.position.set(0, 0.9, 8.2)
        cam.lookAt(0, 0.45, 0)
      }
      renderer.render(scene, cam)
    }
    frame()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      rig?.dispose()
      shadowPlane.geometry.dispose()
      ;(shadowPlane.material as THREE.Material).dispose()
      envTex.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, still])

  if (failed) return <RobotSvg mood={mood} size={size} animate className={className} />
  return <div ref={host} className={className} style={{ width: size, height: size, position: 'relative' }} aria-label="UcaMedya robotu" role="img" />
}

/** Hafif alternatif: aynı karakterin 2D (SVG) çizimi. */
export function RobotSvg({ mood = 'idle', size = 160, animate = true, className }: { mood?: RobotMood; size?: number | string; animate?: boolean; className?: string }) {
  const eye = mood === 'warning' ? '#f2b347' : '#ff8a4c'
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 200 200" role="img" aria-label="UcaMedya robotu">
      <defs>
        <linearGradient id="rs-shell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e4e0d8" />
        </linearGradient>
        <radialGradient id="rs-glow">
          <stop offset="0" stopColor="#e95a1b" stopOpacity="0.5" />
          <stop offset="1" stopColor="#e95a1b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g style={animate ? { animation: 'robotFloat 3.6s ease-in-out infinite', transformOrigin: '100px 100px' } : undefined}>
        <ellipse cx="100" cy="182" rx="40" ry="6" fill="url(#rs-glow)" />
        <path d="M58 120 Q58 92 100 92 Q142 92 142 120 L138 160 Q100 176 62 160 Z" fill="url(#rs-shell)" stroke="#d3cfc6" />
        <rect x="76" y="112" width="48" height="28" rx="8" fill="#161618" />
        <text x="100" y="131" textAnchor="middle" fontFamily="Outfit, sans-serif" fontWeight="700" fontSize="13" fill="#fff">uca</text>
        <circle cx="117" cy="121" r="2" fill="#e95a1b" />
        <rect x="70" y="150" width="60" height="4" rx="2" fill="#e95a1b" />
        <g style={animate && (mood === 'wave' || mood === 'enter') ? { animation: 'robotWave 0.6s ease-in-out infinite alternate', transformOrigin: '146px 104px' } : undefined}>
          <rect x="140" y="100" width="14" height="38" rx="7" fill="url(#rs-shell)" stroke="#d3cfc6" transform={mood === 'wave' || mood === 'enter' || mood === 'success' ? 'rotate(-140 146 104)' : 'rotate(-12 146 104)'} />
        </g>
        <rect x="46" y="100" width="14" height="38" rx="7" fill="url(#rs-shell)" stroke="#d3cfc6" transform={mood === 'success' ? 'rotate(140 54 104)' : 'rotate(12 54 104)'} />
        <rect x="52" y="34" width="96" height="62" rx="24" fill="url(#rs-shell)" stroke="#d3cfc6" />
        <rect x="62" y="44" width="76" height="42" rx="16" fill="#161618" />
        <rect x="80" y="58" width="10" height="14" rx="5" fill={eye} />
        <rect x="110" y="58" width="10" height="14" rx="5" fill={eye} />
        <path d="M93 77 Q100 82 107 77" stroke={eye} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <line x1="118" y1="34" x2="122" y2="20" stroke="#2b2b2f" strokeWidth="3" />
        <circle cx="123" cy="16" r="6" fill="#e95a1b" />
        <rect x="45" y="56" width="8" height="18" rx="4" fill="#161618" />
        <rect x="147" y="56" width="8" height="18" rx="4" fill="#161618" />
      </g>
      <style>{`@keyframes robotFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}@keyframes robotWave{from{transform:rotate(-10deg)}to{transform:rotate(14deg)}}`}</style>
    </svg>
  )
}

/** Boş ekranlar ve bildirimler için konuşma balonlu robot. */
export function RobotHint({ text, mood = 'idle', size = 120 }: { text: React.ReactNode; mood?: RobotMood; size?: number }) {
  return (
    <div className="row" style={{ gap: 4, alignItems: 'center' }}>
      <Robot mood={mood} size={size} />
      <div className="robot-bubble" style={{ maxWidth: 380 }}>{text}</div>
    </div>
  )
}
