// "Uca" — UcaMedya'nın 3D robot maskotu. Model kodla (prosedürel) oluşturulur: ek dosya indirmez,
// her açılışta aynı görünür ve GLTFExporter ile .glb olarak dışa aktarılabilir.
// Tasarım dili: logodaki yuvarlak "u-c-a" hatları → yumuşak köşeli kafa ve gövde; logodaki turuncu nokta →
// anten ucu ve gözler. Gövde sıcak beyaz seramik, yüz siperliği antrasit cam, ayrıntılar marka turuncusu.

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

export const BRAND = 0xe95a1b
export const CHARCOAL = 0x161618

export interface RobotRig {
  root: THREE.Group
  body: THREE.Group
  head: THREE.Group
  eyes: THREE.Mesh[]
  eyeMat: THREE.MeshStandardMaterial
  antennaTip: THREE.Mesh
  antennaMat: THREE.MeshStandardMaterial
  armL: THREE.Group
  armR: THREE.Group
  forearmR: THREE.Group
  forearmL: THREE.Group
  ring: THREE.Mesh
  ringMat: THREE.MeshBasicMaterial
  chestLight: THREE.Mesh
  dispose(): void
}

function capsule(r: number, len: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 24), mat)
  m.castShadow = true
  return m
}

export function buildRobot(logoTexture: THREE.Texture | null): RobotRig {
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xf3f1ec, roughness: 0.32, metalness: 0.0, clearcoat: 0.9, clearcoatRoughness: 0.18, sheen: 0.2 })
  const dark = new THREE.MeshPhysicalMaterial({ color: CHARCOAL, roughness: 0.18, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 })
  const joint = new THREE.MeshStandardMaterial({ color: 0x2b2b2f, roughness: 0.45, metalness: 0.55 })
  const accent = new THREE.MeshStandardMaterial({ color: BRAND, roughness: 0.35, metalness: 0.15, emissive: BRAND, emissiveIntensity: 0.15 })
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffb08a, emissive: BRAND, emissiveIntensity: 2.4, roughness: 0.3 })
  const antennaMat = new THREE.MeshStandardMaterial({ color: BRAND, emissive: BRAND, emissiveIntensity: 1.6, roughness: 0.25 })
  const geoms: THREE.BufferGeometry[] = []
  const track = <G extends THREE.BufferGeometry>(g: G) => (geoms.push(g), g)

  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  // ---- Gövde (yumurta formu, lathe) ----
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    const y = -0.95 + t * 1.9
    const r = 0.86 * Math.sin(Math.PI * (0.06 + t * 0.88)) * (1 - 0.18 * t) + 0.02
    pts.push(new THREE.Vector2(Math.max(0.001, r), y))
  }
  const torso = new THREE.Mesh(track(new THREE.LatheGeometry(pts, 64)), shell)
  torso.scale.set(1, 1, 0.82)
  torso.castShadow = true
  body.add(torso)

  // Göğüs paneli (antrasit cam) + logo
  const panel = new THREE.Mesh(track(new RoundedBoxGeometry(0.98, 0.62, 0.12, 6, 0.12)), dark)
  panel.position.set(0, 0.12, 0.62)
  panel.rotation.x = -0.12
  body.add(panel)
  if (logoTexture) {
    logoTexture.colorSpace = THREE.SRGBColorSpace
    logoTexture.anisotropy = 8
    const aspect = 500 / 242
    const logo = new THREE.Mesh(track(new THREE.PlaneGeometry(0.62, 0.62 / aspect)), new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true, toneMapped: false }))
    logo.position.set(0, 0.13, 0.687)
    logo.rotation.x = -0.12
    body.add(logo)
  }
  // Göğüs ışığı (durum göstergesi)
  const chestLight = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.025, 0.22, 4, 12)), antennaMat.clone())
  chestLight.rotation.z = Math.PI / 2
  chestLight.position.set(0, -0.28, 0.66)
  body.add(chestLight)
  // Bel bandı
  const belt = new THREE.Mesh(track(new THREE.TorusGeometry(0.62, 0.035, 12, 64)), accent)
  belt.rotation.x = Math.PI / 2
  belt.scale.set(1, 0.82, 1)
  belt.position.y = -0.56
  body.add(belt)

  // ---- Boyun + kafa ----
  const neck = new THREE.Mesh(track(new THREE.CylinderGeometry(0.2, 0.26, 0.2, 32)), joint)
  neck.position.y = 0.98
  body.add(neck)
  const head = new THREE.Group()
  head.position.y = 1.62
  body.add(head)
  const skull = new THREE.Mesh(track(new RoundedBoxGeometry(1.56, 1.12, 1.18, 8, 0.42)), shell)
  skull.castShadow = true
  head.add(skull)
  const visor = new THREE.Mesh(track(new RoundedBoxGeometry(1.3, 0.74, 0.3, 8, 0.28)), dark)
  visor.position.set(0, -0.02, 0.48)
  head.add(visor)
  const eyes: THREE.Mesh[] = []
  for (const x of [-0.29, 0.29]) {
    const e = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.085, 0.13, 6, 20)), eyeMat)
    e.position.set(x, 0.02, 0.64)
    head.add(e)
    eyes.push(e)
  }
  // Gülümseme
  const smile = new THREE.Mesh(track(new THREE.TorusGeometry(0.12, 0.018, 8, 32, Math.PI)), eyeMat)
  smile.rotation.z = Math.PI
  smile.position.set(0, -0.2, 0.64)
  head.add(smile)
  // Kulaklıklar
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(track(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 40)), dark)
    ear.rotation.z = Math.PI / 2
    ear.position.set(s * 0.82, 0, 0)
    head.add(ear)
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.15, 0.025, 10, 40)), accent)
    ring.rotation.y = Math.PI / 2
    ring.position.set(s * 0.9, 0, 0)
    head.add(ring)
  }
  // Anten — logodaki turuncu nokta
  const stem = new THREE.Mesh(track(new THREE.CylinderGeometry(0.025, 0.035, 0.34, 12)), joint)
  stem.position.set(0.32, 0.72, 0)
  stem.rotation.z = -0.18
  head.add(stem)
  const antennaTip = new THREE.Mesh(track(new THREE.SphereGeometry(0.1, 32, 24)), antennaMat)
  antennaTip.position.set(0.36, 0.92, 0)
  head.add(antennaTip)

  // ---- Kollar ----
  const makeArm = (side: 1 | -1) => {
    const arm = new THREE.Group()
    arm.position.set(side * 0.86, 0.48, 0)
    const shoulder = new THREE.Mesh(track(new THREE.SphereGeometry(0.2, 32, 24)), joint)
    arm.add(shoulder)
    const upper = capsule(0.15, 0.38, shell)
    upper.position.y = -0.34
    arm.add(upper)
    const fore = new THREE.Group()
    fore.position.y = -0.64
    arm.add(fore)
    const elbow = new THREE.Mesh(track(new THREE.SphereGeometry(0.14, 24, 16)), joint)
    fore.add(elbow)
    const lower = capsule(0.135, 0.32, shell)
    lower.position.y = -0.3
    fore.add(lower)
    const cuff = new THREE.Mesh(track(new THREE.TorusGeometry(0.135, 0.025, 8, 32)), accent)
    cuff.rotation.x = Math.PI / 2
    cuff.position.y = -0.47
    fore.add(cuff)
    const hand = new THREE.Mesh(track(new THREE.SphereGeometry(0.17, 32, 24)), dark)
    hand.scale.set(1, 1.1, 0.85)
    hand.position.y = -0.64
    fore.add(hand)
    arm.rotation.z = side * 0.18
    body.add(arm)
    return { arm, fore }
  }
  const L = makeArm(-1)
  const R = makeArm(1)

  // ---- Süzülme halkası ----
  const ringMat = new THREE.MeshBasicMaterial({ color: BRAND, transparent: true, opacity: 0.55, toneMapped: false })
  const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.7, 0.02, 8, 96)), ringMat)
  ring.rotation.x = Math.PI / 2
  ring.position.y = -1.32
  root.add(ring)

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true
  })

  return {
    root, body, head, eyes, eyeMat, antennaTip, antennaMat, armL: L.arm, armR: R.arm, forearmL: L.fore, forearmR: R.fore, ring, ringMat, chestLight,
    dispose() {
      geoms.forEach((g) => g.dispose())
      ;[shell, dark, joint, accent, eyeMat, antennaMat, ringMat].forEach((m) => m.dispose())
      logoTexture?.dispose()
    }
  }
}

export type RobotMood = 'idle' | 'wave' | 'success' | 'warning' | 'thinking' | 'notify' | 'enter'

/** Her karede çağrılır: t = saniye, mt = mod başladığından beri geçen saniye. */
export function animateRobot(r: RobotRig, mood: RobotMood, t: number, mt: number) {
  // Süzülme ve nefes
  r.body.position.y = Math.sin(t * 1.6) * 0.06
  r.ring.scale.setScalar(1 + Math.sin(t * 1.6) * 0.04)
  r.ringMat.opacity = 0.35 + Math.sin(t * 1.6 + 1) * 0.15
  // Göz kırpma
  const blink = (t % 4.2) < 0.12 ? 0.15 : 1
  r.eyes.forEach((e) => (e.scale.y = blink))
  // Anten nabzı
  r.antennaMat.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.6
  // Varsayılan pozlar (yumuşak geri dönüş)
  const lerp = (a: number, b: number, k = 0.12) => a + (b - a) * k
  let armRz = 0.18
  let foreRz = 0
  let armLz = -0.18
  let headY = Math.sin(t * 0.5) * 0.12
  let headZ = 0
  let headX = 0
  let bodyRy = Math.sin(t * 0.35) * 0.12
  let eyeColor = 2.4
  switch (mood) {
    case 'enter':
    case 'wave': {
      const w = Math.min(1, mt / 0.5)
      armRz = 0.18 + w * 2.5
      foreRz = w * (0.35 + Math.sin(mt * 9) * 0.45)
      headZ = -0.12 * w
      headY = 0.15 * w
      break
    }
    case 'success': {
      headX = Math.sin(mt * 8) * 0.12 * Math.max(0, 1 - mt / 1.5)
      armRz = 0.18 + 2.7 * Math.min(1, mt / 0.3)
      armLz = -0.18 - 2.7 * Math.min(1, mt / 0.3)
      r.body.position.y += Math.abs(Math.sin(mt * 7)) * 0.12 * Math.max(0, 1 - mt / 1.6)
      break
    }
    case 'warning': {
      headY = Math.sin(mt * 9) * 0.25 * Math.max(0.2, 1 - mt / 2)
      eyeColor = 1.4
      r.antennaMat.emissiveIntensity = 0.6 + (Math.sin(t * 10) > 0 ? 1.8 : 0)
      break
    }
    case 'thinking': {
      headZ = 0.18
      headY = 0.25
      armRz = 0.18 + 1.2
      foreRz = 1.9
      r.antennaMat.emissiveIntensity = 1 + Math.sin(t * 6) * 0.9
      break
    }
    case 'notify': {
      r.body.position.y += Math.abs(Math.sin(mt * 6)) * 0.1 * Math.max(0, 1 - mt / 1.2)
      headZ = Math.sin(mt * 6) * 0.08
      break
    }
  }
  r.armR.rotation.z = lerp(r.armR.rotation.z, armRz)
  r.forearmR.rotation.z = lerp(r.forearmR.rotation.z, foreRz)
  r.armL.rotation.z = lerp(r.armL.rotation.z, armLz)
  r.head.rotation.y = lerp(r.head.rotation.y, headY)
  r.head.rotation.z = lerp(r.head.rotation.z, headZ)
  r.head.rotation.x = lerp(r.head.rotation.x, headX)
  r.body.rotation.y = lerp(r.body.rotation.y, bodyRy, 0.05)
  r.eyeMat.emissiveIntensity = lerp(r.eyeMat.emissiveIntensity, eyeColor)
}
