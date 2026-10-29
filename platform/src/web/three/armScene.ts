// Renders the `robot-arm` ("Sweetness Chef" <-> "Surgical/Industrial 6-DOF Manipulator") snapshot as a 3D scene.
// Pure view: reads SelectSim snapshot (`open`, `selected`, `done`, `doneAt`, `target`, `locked`).
// Left pane skins ("toy"/"neutral") are a kitchen / a plain studio; right pane skins ("real"/"sandbox") are a clinical lab / a holo sandbox.
import * as THREE from "three";
import type { SceneEvents, SceneHandle, SceneSkin } from "./droneScene";
import { applyEnvironment, brushedTex, canvasTex, contactShadow, disposeRenderer, fitToContainer, glassMat, makePost, gradientBackground, lathe, lightPool, linkGeometry, makeCanvas, makeRenderer, marbleTex, noiseTex, paint, rng, roundedBox, shadowSize, signTex, std, woodTex } from "./realism";

export interface SelectSnap {
  open: boolean;
  selected: number | null;
  energy: number;
  done: boolean;
  doneAt: number | null;
  score: number;
  everOpened: boolean;
  reached: boolean;
  target: number;
  locked: number[];
  n: number;
  live?: boolean;
}

const slotAngle = (i: number, n = 6) => ((i - (n - 1) / 2) / (n - 1)) * (Math.PI * 0.78);
const slotPos = (i: number, r = 10.5) => {
  const a = slotAngle(i);
  return new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r - 1.5);
};

// arm geometry (world units); the arm base sits at z = ARM_Z and every slot is on an arc around it
const ARM_Z = -2.2, SH_Y = 3.7, L1 = 6.4, L2 = 6.6, TOOL = 2.4, HOVER = 2.2, PLUNGE = HOVER + 0.05;
const slotYaw = (i: number) => { const p = slotPos(i); return Math.atan2(p.x, p.z - ARM_Z); };
const slotReach = (i: number) => { const p = slotPos(i); return Math.hypot(p.x, p.z - ARM_Z); };

/** Two-link planar inverse kinematics in the arm's vertical plane. Angles are measured from straight up, toward the slot. */
function solveIK(x: number, y: number) {
  let D = Math.hypot(x, y);
  const maxD = L1 + L2 - 0.02, minD = Math.abs(L1 - L2) + 0.05;
  const s = D > maxD ? maxD / D : D < minD ? minD / D : 1;
  x *= s; y *= s; D *= s;
  const c = Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2)));
  const t2 = Math.PI - Math.acos(c);
  const t1 = Math.atan2(x, y) - Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2));
  return { t1, t2 };
}


// ---------- fruit (kitchen skin) ----------
const stem = (h = 0.32) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, h, 8), std(0x5b3a1e, 0.8)); m.rotation.z = 0.2; return m; };
function fruit(kind: number): { g: THREE.Group; top: number } {
  const g = new THREE.Group();
  const k = kind % 5;
  if (k === 0) { // apple
    const prof: [number, number][] = [[0.0, 0.1], [0.4, 0.0], [0.8, 0.2], [0.98, 0.65], [1.0, 1.1], [0.82, 1.55], [0.5, 1.78], [0.22, 1.7], [0.0, 1.5]];
    const tex = canvasTex(128, 128, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#9b1c1c"); gr.addColorStop(0.7, "#d62828"); gr.addColorStop(1, "#c9a227"); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      const r = rng(5); for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(255,${180 + (r() * 60) | 0},60,${0.05 + r() * 0.1})`; c.fillRect(r() * w, 0, 1 + r() * 3, h); }
    });
    const m = new THREE.Mesh(lathe(prof, 36), paint(0xffffff, { map: tex, roughness: 0.3, clearcoat: 1 }));
    m.scale.setScalar(0.86); g.add(m);
    const s = stem(); s.position.set(0.02, 1.62, 0); g.add(s);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), std(0x3f8f2f, 0.55)); leaf.scale.set(1, 0.07, 0.5); leaf.position.set(0.28, 1.66, 0); leaf.rotation.z = 0.35; g.add(leaf);
    return { g, top: 1.55 };
  }
  if (k === 1) { // orange
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.92, 40, 28), std(0xf08a14, 0.55, 0, { bumpMap: noiseTex(256, 7, 8, 1.8, [3, 2]), bumpScale: 0.9 }));
    m.position.y = 0.88; g.add(m);
    const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.06, 12), std(0x4a6a1f, 0.7)); nub.position.y = 1.78; g.add(nub);
    return { g, top: 1.8 };
  }
  if (k === 2) { // lemon
    const prof: [number, number][] = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, r = Math.pow(Math.sin(Math.PI * t), 0.85) * 0.68 + (i === 0 || i === 24 ? 0 : 0); prof.push([Math.max(r, 0.001), t * 1.55]); }
    const m = new THREE.Mesh(lathe(prof, 32), std(0xf6d23a, 0.5, 0, { bumpMap: noiseTex(256, 11, 8, 1.6, [2, 2]), bumpScale: 0.6 }));
    m.rotation.z = Math.PI / 2; m.position.set(-0.75, 0.68, 0); m.rotation.y = 0.5; g.add(m);
    return { g, top: 1.4 };
  }
  if (k === 3) { // peach
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.88, 40, 28), std(0xf4a36a, 0.72, 0, { map: canvasTex(64, 64, (c, w, h) => { const gr = c.createRadialGradient(w * 0.3, h * 0.35, 4, w * 0.5, h * 0.5, w * 0.7); gr.addColorStop(0, "#ffd9a0"); gr.addColorStop(1, "#e2566b"); c.fillStyle = gr; c.fillRect(0, 0, w, h); }), bumpMap: noiseTex(128, 3, 10, 1.4, [2, 2]), bumpScale: 0.25 }));
    m.scale.set(1, 0.95, 1); m.position.y = 0.84; g.add(m);
    const s = stem(0.2); s.position.set(0, 1.64, 0); g.add(s);
    return { g, top: 1.7 };
  }
  // pear
  const prof: [number, number][] = [[0.001, 0], [0.5, 0.05], [0.85, 0.3], [0.95, 0.7], [0.8, 1.1], [0.52, 1.5], [0.34, 1.95], [0.2, 2.2], [0.001, 2.26]];
  const m = new THREE.Mesh(lathe(prof, 36), std(0xb7c93a, 0.5, 0, { bumpMap: noiseTex(256, 13, 9, 1.5, [2, 2]), bumpScale: 0.35 }));
  m.scale.setScalar(0.8); g.add(m);
  const s = stem(0.4); s.position.set(0.02, 1.95, 0); g.add(s);
  return { g, top: 1.9 };
}

function watermelon(): THREE.Group {
  const g = new THREE.Group();
  const map = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = "#3d9b45"; c.fillRect(0, 0, w, h);
    const r = rng(21);
    for (let i = 0; i < 14; i++) {
      const x0 = (i / 14) * w; c.fillStyle = "rgba(14,70,34,.78)"; c.beginPath(); c.moveTo(x0, 0);
      for (let y = 0; y <= h; y += 8) c.lineTo(x0 + Math.sin(y * 0.05 + i) * 9 + 8, y);
      for (let y = h; y >= 0; y -= 8) c.lineTo(x0 + Math.sin(y * 0.05 + i) * 9 - 8 + 22, y);
      c.fill();
    }
    for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(255,255,255,${r() * 0.05})`; c.fillRect(r() * w, r() * h, 2, 1); }
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 56, 40), paint(0xffffff, { map, roughness: 0.42, clearcoat: 0.5, bumpMap: noiseTex(256, 4, 6, 1.2, [3, 2]), bumpScale: 0.25 }));
  m.scale.set(1.62, 1.15, 1.15); m.position.y = 1.18; g.add(m);
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.36, 10), std(0x4d5a2a, 0.8)); s.position.y = 2.38; s.rotation.z = 0.25; g.add(s);
  return g;
}

// ---------- ECG monitor (animated) ----------
function makeEcg() {
  const c = document.createElement("canvas"); c.width = 320; c.height = 160;
  const g = c.getContext("2d")!, tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const beat = (p: number) => { // one PQRST complex over phase 0..1
    if (p < 0.1) return 0; if (p < 0.18) return Math.sin(((p - 0.1) / 0.08) * Math.PI) * 0.14; if (p < 0.28) return 0;
    if (p < 0.31) return -0.18 * ((p - 0.28) / 0.03); if (p < 0.36) return -0.18 + 1.18 * ((p - 0.31) / 0.05); if (p < 0.41) return 1 - 1.35 * ((p - 0.36) / 0.05);
    if (p < 0.45) return -0.35 + 0.35 * ((p - 0.41) / 0.04); if (p < 0.6) return 0; if (p < 0.78) return Math.sin(((p - 0.6) / 0.18) * Math.PI) * 0.28; return 0;
  };
  function draw(t: number, alarm: boolean, off: boolean) {
    g.fillStyle = off ? "#101418" : alarm ? "#220808" : "#031a11"; g.fillRect(0, 0, 320, 160);
    if (off) { tex.needsUpdate = true; return; }
    g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 1;
    for (let x = 0; x < 320; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 160); g.stroke(); }
    for (let y = 0; y < 160; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(320, y); g.stroke(); }
    const hr = alarm ? 168 : 112, bps = hr / 60, col = alarm ? "#f87171" : "#34d399";
    g.strokeStyle = col; g.lineWidth = 3; g.shadowColor = col; g.shadowBlur = 8; g.beginPath();
    for (let x = 0; x <= 320; x += 2) {
      const ph = (((x / 320) * 2.6 - t * bps) % 1 + 1) % 1, y = 96 - beat(ph) * (alarm ? 46 : 54) + (alarm ? Math.sin(x * 0.9 + t * 30) * 5 : 0);
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke(); g.shadowBlur = 0;
    g.fillStyle = col; g.font = "bold 20px monospace"; g.fillText(`HR ${hr}`, 10, 24); g.fillStyle = "#7dd3fc"; g.fillText("SpO2 97", 130, 24); g.fillStyle = "#fde68a"; g.fillText("37.1C", 244, 24);
    tex.needsUpdate = true;
  }
  return { tex, draw };
}

export function createArmScene(container: HTMLElement, skin: SceneSkin, s0: SelectSnap, ev: SceneEvents): SceneHandle<SelectSnap> {
  const toy = skin === "toy", real = skin === "real", sand = skin === "sandbox", neu = skin === "neutral";
  const clinical = real || sand;
  const canvas = makeCanvas(container);

  const renderer = makeRenderer(canvas, toy ? 0.92 : real ? 1.12 : 1.0);
  const scene = new THREE.Scene();
  scene.background = toy ? gradientBackground([[0, "#fde7c8"], [1, "#fff3df"]]) : real ? gradientBackground([[0, "#0a0d13"], [1, "#161d29"]]) : sand ? gradientBackground([[0, "#0a1612"], [1, "#12251d"]]) : gradientBackground([[0, "#eef0f3"], [1, "#d6dae0"]]);
  scene.fog = neu ? null : new THREE.Fog(toy ? 0xfff0da : real ? 0x0d1219 : 0x0d1a15, 46, 120);
  applyEnvironment(renderer, scene, toy ? 0.42 : real ? 0.32 : sand ? 0.28 : 0.6);

  const camera = new THREE.PerspectiveCamera(38, 16 / 10, 0.5, 300);
  const K = Math.PI;
  scene.add(new THREE.HemisphereLight(toy ? 0xfff3df : real ? 0x6b7f9e : sand ? 0x7fe0b0 : 0xffffff, toy ? 0xd8c3a0 : 0x0a0e14, (toy ? 0.55 : 0.32) * K));
  const key = new THREE.DirectionalLight(toy ? 0xfff0d2 : real ? 0xdbe7ff : sand ? 0xc8ffe0 : 0xffffff, (toy ? 1.55 : real ? 1.45 : 1.2) * K);
  key.position.set(toy ? -16 : 12, 30, 18);
  key.castShadow = true; key.shadow.mapSize.set(shadowSize(), shadowSize()); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.03; key.shadow.radius = 4;
  Object.assign(key.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
  scene.add(key);
  // soft fill from the camera side lifts the shadow side of the arm (no shadow of its own, so it is cheap)
  const fill = new THREE.DirectionalLight(toy ? 0xffe6c8 : real ? 0x9fb4d8 : sand ? 0x9fe8c0 : 0xffffff, (toy ? 0.35 : 0.3) * K);
  fill.position.set(toy ? 14 : -10, 9, 30); scene.add(fill);
  if (clinical) {
    const rim = new THREE.DirectionalLight(sand ? 0x4ade80 : 0xff9a55, 0.9 * K); rim.position.set(-20, 12, -14); scene.add(rim);
  }

  // ---------- environment ----------
  const floorMat = toy
    ? std(0xffffff, 0.22, 0, { map: marbleTex(7, [5, 5]), roughnessMap: noiseTex(256, 6, 8, 0.5, [10, 10]), envMapIntensity: 0.9 })
    : clinical
      ? std(0xffffff, 0.24, 0.1, {
        map: canvasTex(256, 256, (g, w, h) => { // large epoxy floor tiles with dark seams
          g.fillStyle = real ? "#1d242e" : "#16271f"; g.fillRect(0, 0, w, h);
          const r = rng(44); for (let i = 0; i < 2200; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.035})`; g.fillRect(r() * w, r() * h, 2, 2); }
          g.strokeStyle = "rgba(0,0,0,.55)"; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
          g.strokeStyle = "rgba(255,255,255,.05)"; g.lineWidth = 1; g.strokeRect(3, 3, w - 6, h - 6);
        }, { repeat: [26, 26] }),
        roughnessMap: noiseTex(512, 8, 10, 0.8, [8, 8]), envMapIntensity: 1.4,
      })
      : std(0xe3e6ea, 0.6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  if (toy) { // tiled kitchen backsplash, window, jars, a fruit bowl
    const wallMap = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#c9c2b6"; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) for (let x = -1; x < 3; x++) {
        const ox = (y % 2) * 64 + x * 128, r = rng(y * 7 + x + 3);
        g.fillStyle = `rgb(${244 + ((r() * 8) | 0)},${242 + ((r() * 8) | 0)},${236 + ((r() * 8) | 0)})`; g.fillRect(ox + 2, y * 64 + 2, 124, 60);
        g.fillStyle = "rgba(255,255,255,.55)"; g.fillRect(ox + 2, y * 64 + 2, 124, 5);
      }
    }, { repeat: [14, 5] });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(160, 40), std(0xffffff, 0.35, 0, { map: wallMap }));
    wall.position.set(0, 20, -20); wall.receiveShadow = true; scene.add(wall);
    const winFrame = new THREE.Mesh(roundedBox(14.4, 11.4, 0.5, 0.15), std(0xf7f3ea, 0.5)); winFrame.position.set(-16, 13, -19.7); scene.add(winFrame);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(13, 10), new THREE.MeshBasicMaterial({ map: gradientBackground([[0, "#9fd4ff"], [0.7, "#e6f4ff"], [1, "#b9e3a4"]]), toneMapped: false }));
    glass.position.set(-16, 13, -19.4); scene.add(glass);
    for (const [bx, by, bw, bh] of [[0, 0, 0.35, 10], [0, 0, 13, 0.35]] as const) { const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.3), std(0xf7f3ea, 0.5)); bar.position.set(-16 + bx, 13 + by, -19.2); scene.add(bar); }
    const jarCols = [0xb45309, 0x15803d, 0xdc2626];
    jarCols.forEach((c, i) => {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.6, 28), glassMat(0xe2f1f5, 0.32)); jar.position.set(12 + i * 2.7, 1.3, -16.5); scene.add(jar);
      const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 1.7 + i * 0.2, 24), std(c, 0.85, 0, { bumpMap: noiseTex(128, 5 + i, 12, 1.5), bumpScale: 0.6 })); fill.position.set(12 + i * 2.7, 0.9 + i * 0.1, -16.5); scene.add(fill);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.3, 28), std(0xc0c4cc, 0.3, 0.9)); lid.position.set(12 + i * 2.7, 2.75, -16.5); scene.add(lid);
    });
    const crock = new THREE.Mesh(lathe([[0.001, 0], [1.3, 0], [1.45, 1.4], [1.5, 2.6], [1.35, 2.6], [1.3, 1.5], [0.001, 0.2]], 32), paint(0x4f6d8f, { roughness: 0.4 })); crock.position.set(-6.5, 0, -16.8); crock.material.side = THREE.DoubleSide; scene.add(crock);
    for (let i = 0; i < 4; i++) { const u = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 4.0 + i * 0.4, 8), std(i % 2 ? 0xa16207 : 0xc0c4cc, 0.4, i % 2 ? 0 : 0.9)); u.position.set(-6.5 + (i - 1.5) * 0.4, 3.4, -16.8 + ((i * 7) % 3 - 1) * 0.25); u.rotation.z = (i - 1.5) * 0.12; scene.add(u); }
    const bowl = new THREE.Mesh(lathe([[0.001, 0], [1.4, 0.0], [2.9, 1.5], [3.0, 1.65], [2.88, 1.65], [1.4, 0.18], [0.001, 0.15]], 40), paint(0xe9e4da, { roughness: 0.3 }));
    bowl.material.side = THREE.DoubleSide; bowl.position.set(-12, 0, -13); scene.add(bowl);
    const pot = new THREE.Mesh(lathe([[0.001, 0], [0.85, 0], [1.1, 1.5], [1.18, 1.55], [1.05, 1.6], [0.001, 1.45]], 32), std(0xc2683a, 0.85, 0, { bumpMap: noiseTex(128, 51, 10, 1.3), bumpScale: 0.3 }));
    pot.position.set(6.2, 0, -16.2); scene.add(pot);
    const leafMat = std(0x3f9b3a, 0.55, 0, { side: THREE.DoubleSide }), lr = rng(52);
    for (let k = 0; k < 26; k++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 6), leafMat); leaf.scale.set(1, 0.18, 0.6);
      const a = lr() * 6.28, rr = lr() * 0.8; leaf.position.set(6.2 + Math.cos(a) * rr, 1.7 + lr() * 1.4, -16.2 + Math.sin(a) * rr); leaf.rotation.set(lr() - 0.5, a, lr() - 0.5); scene.add(leaf);
    }
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 12), std(0xc6ccd5, 0.25, 0.95)); rail.rotation.z = Math.PI / 2; rail.position.set(-1.5, 6.5, -19.5); scene.add(rail);
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.2, 1, 6), std(0xffffff, 0.95, 0, { side: THREE.DoubleSide, map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = "#f5f1e8"; c.fillRect(0, 0, w, h); c.fillStyle = "#3b6fb6"; for (const y of [6, 12, 50, 56]) c.fillRect(0, y, w, 3); c.fillStyle = "#e0526b"; c.fillRect(0, 30, w, 4); }) }));
    towel.position.set(-1.0, 4.9, -19.35); scene.add(towel);
    for (let i = 0; i < 4; i++) { const f = fruit(i).g; f.scale.setScalar(0.7); f.position.set(-12 + Math.cos(i * 1.6) * 1.2, 0.9, -13 + Math.sin(i * 1.6) * 1.2); scene.add(f); }
  } else if (clinical) { // dark clinical lab: panelled wall with LED strips, hazard ring around the arm, floor guides
    const panel = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = real ? "#1c2430" : "#14251d"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
      g.fillStyle = "rgba(255,255,255,.04)"; g.fillRect(8, 8, w - 16, 6);
      const r = rng(31); for (let i = 0; i < 800; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.04})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1); }
    }, { repeat: [20, 6] });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(160, 40), std(0xffffff, 0.55, 0.3, { map: panel }));
    wall.position.set(0, 20, -20); wall.receiveShadow = true; scene.add(wall);
    for (const y of [7, 14, 21]) { const strip = new THREE.Mesh(new THREE.BoxGeometry(70, 0.35, 0.25), new THREE.MeshBasicMaterial({ color: sand ? 0x86efac : 0xd6e6ff, toneMapped: false })); strip.position.set(0, y, -19.8); scene.add(strip); }
    const obsFrame = new THREE.Mesh(roundedBox(22, 7.4, 0.6, 0.2), std(0x2a313b, 0.4, 0.7)); obsFrame.position.set(-13, 15.5, -19.6); scene.add(obsFrame);
    const obs = new THREE.Mesh(new THREE.PlaneGeometry(21, 6.6), new THREE.MeshBasicMaterial({ map: gradientBackground(sand ? [[0, "#0f3b2a"], [1, "#05140e"]] : [[0, "#1b3554"], [0.6, "#0d1a2b"], [1, "#070b12"]]), toneMapped: false }));
    obs.position.set(-13, 15.5, -19.25); scene.add(obs);
    for (let k = 0; k < 3; k++) { const mull = new THREE.Mesh(new THREE.BoxGeometry(0.25, 6.6, 0.2), std(0x2a313b, 0.4, 0.7)); mull.position.set(-13 + (k - 1) * 7, 15.5, -19.15); scene.add(mull); }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.5), new THREE.MeshBasicMaterial({ map: signTex(sand ? ["SANDBOX", "SIMULATION ONLY · NO SUBJECT"] : ["OR-3 · STERILE FIELD", "LIVE SUBJECT · AUTHORISED STAFF ONLY"], sand ? "#14532d" : "#7f1d1d", "#ffffff"), toneMapped: false }));
    sign.position.set(14, 16, -19.7); scene.add(sign);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 0.5, 40), std(0xe5e7eb, 0.3, 0.6)); lamp.position.set(9, 26, 2); scene.add(lamp);
    const pool = lightPool(18, sand ? 0x4ade80 : 0xbcd4ff, 0.16); pool.position.set(slotPos(s0.target).x, 0.03, slotPos(s0.target).z); scene.add(pool);
    const hazard = canvasTex(256, 32, (g, w, h) => { g.fillStyle = "#facc15"; g.fillRect(0, 0, w, h); g.fillStyle = "#111"; for (let x = -h; x < w; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill(); } }, { repeat: [3, 1] });
    const ringMark = new THREE.Mesh(new THREE.RingGeometry(3.1, 3.55, 64), new THREE.MeshBasicMaterial({ map: hazard, side: THREE.DoubleSide }));
    ringMark.rotation.x = -Math.PI / 2; ringMark.position.set(0, 0.03, ARM_Z); scene.add(ringMark);
    const arcLine = new THREE.Mesh(new THREE.TorusGeometry(10.5, 0.04, 6, 120, Math.PI * 0.9), new THREE.MeshBasicMaterial({ color: sand ? 0x4ade80 : 0x38bdf8, transparent: true, opacity: 0.45 }));
    arcLine.rotation.x = Math.PI / 2; arcLine.rotation.z = Math.PI * 0.05; arcLine.position.set(0, 0.03, ARM_Z + 0.7); scene.add(arcLine);
  }

  // ---------- bays ----------
  const topY: number[] = [];
  const bayGroups: THREE.Group[] = [];
  let chestMesh: THREE.Mesh | null = null, redBeacon: THREE.PointLight | null = null, targetRing: THREE.Mesh | null = null;
  const ecg = makeEcg(); let monitorScreen: THREE.Mesh | null = null;
  const wood = toy ? woodTex("#c68a4a", "#6b3f17", 4, [1.4, 1.4]) : null;
  const woodBump = toy ? noiseTex(256, 12, 14, 1.2, [2, 2]) : null;

  for (let i = 0; i < (s0.n || 6); i++) {
    const g = new THREE.Group();
    g.position.copy(slotPos(i));
    g.rotation.y = slotAngle(i);
    const isTarget = i === s0.target, isLocked = s0.locked.includes(i);
    topY[i] = 2.3;

    if (toy) {
      const board = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.2, 0.42, 64), std(0xffffff, 0.55, 0, { map: wood!, bumpMap: woodBump!, bumpScale: 0.5 }));
      board.position.y = 0.21; g.add(board);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(2.14, 0.07, 10, 64), std(0xa8672d, 0.5)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.4; g.add(rim);
      const groove = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.03, 6, 64), std(0x6b3f17, 0.7)); groove.rotation.x = Math.PI / 2; groove.position.y = 0.425; g.add(groove);
      if (isTarget && !isLocked) {
        const mel = watermelon(); mel.position.y = 0.4; g.add(mel); topY[i] = 2.85;
      } else {
        const f = fruit(i + 1); f.g.position.y = 0.4; g.add(f.g); topY[i] = 0.4 + f.top + 0.15;
      }
      if (isLocked) { // glass cloche
        const dome = new THREE.Mesh(new THREE.SphereGeometry(1.95, 36, 20, 0, Math.PI * 2, 0, Math.PI / 2), glassMat(0xe8f4f8, 0.24)); dome.position.y = 0.42; dome.scale.y = 1.15; g.add(dome);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), std(0xc0c4cc, 0.2, 0.95)); knob.position.y = 0.42 + 1.95 * 1.15 + 0.1; g.add(knob);
        topY[i] = 3.0;
      }
    } else if (neu) {
      const ped = new THREE.Mesh(roundedBox(3.4, 0.7, 3.4, 0.2), std(0xb4bac4, 0.5));
      ped.position.y = 0.35; g.add(ped);
      const blk = new THREE.Mesh(roundedBox(1.8, 1.4, 1.8, 0.25), std(isTarget ? 0xdc2626 : 0x8a93a1, 0.45, 0.05));
      blk.position.y = 1.4; g.add(blk); topY[i] = 2.2;
      if (isLocked) { const cover = new THREE.Mesh(roundedBox(3.0, 2.2, 3.0, 0.2), glassMat(0xf59e0b, 0.28)); cover.position.y = 1.7; g.add(cover); topY[i] = 2.8; }
    } else {
      // clinical workstation: stainless table on a column
      const baseP = new THREE.Mesh(roundedBox(3.0, 0.18, 3.8, 0.06), std(0x20252d, 0.4, 0.7)); baseP.position.y = 0.09; g.add(baseP);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 1.45, 24), std(0x9aa4b2, 0.28, 0.9)); col.position.y = 0.9; g.add(col);
      const top = new THREE.Mesh(roundedBox(3.6, 0.2, 4.6, 0.08), std(0xcfd6df, 0.22, 0.9, { envMapIntensity: 1.4 })); top.position.y = 1.62; g.add(top);
      for (const sx of [-1, 1]) { const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.0, 10), std(0xe5e7eb, 0.2, 0.95)); rail.rotation.x = Math.PI / 2; rail.position.set(sx * 1.85, 1.62, 0); g.add(rail); }
      if (isTarget && !isLocked) {
        // draped, strapped patient simulator + vitals monitor
        const drape = real ? std(0x4fb3a5, 0.92, 0, { bumpMap: noiseTex(256, 15, 18, 1.4, [2, 2]), bumpScale: 0.6 }) : new THREE.MeshBasicMaterial({ color: 0x4ade80, wireframe: true, transparent: true, opacity: 0.7 });
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 1.2, 12, 24), drape);
        body.rotation.x = Math.PI / 2; body.scale.set(1.25, 1, 0.86); body.position.set(0, 2.2, -0.35); g.add(body); chestMesh = body;
        for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.5, 8, 16), drape); leg.rotation.x = Math.PI / 2; leg.scale.set(1, 1, 0.8); leg.position.set(sx * 0.34, 2.02, 1.35); g.add(leg); }
        const sheet = new THREE.Mesh(roundedBox(2.0, 0.08, 3.9, 0.04), real ? std(0x4fb3a5, 0.95, 0, { bumpMap: noiseTex(256, 16, 22, 1.5, [2, 3]), bumpScale: 0.8 }) : (drape as THREE.Material)); sheet.position.set(0, 1.76, 0.2); g.add(sheet);
        if (real) {
          const ivPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.6, 8), std(0xd1d5db, 0.25, 0.9)); ivPole.position.set(-2.3, 2.3, -1.2); g.add(ivPole);
          const hook = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 16, Math.PI), std(0xd1d5db, 0.25, 0.9)); hook.position.set(-2.3, 4.6, -1.2); g.add(hook);
          const bag = new THREE.Mesh(roundedBox(0.5, 0.8, 0.14, 0.06), glassMat(0xf1f5f9, 0.55)); bag.position.set(-2.3, 4.1, -1.2); g.add(bag);
          const fluid = new THREE.Mesh(roundedBox(0.42, 0.5, 0.1, 0.04), std(0xfde68a, 0.1, 0, { transparent: true, opacity: 0.7 })); fluid.position.set(-2.3, 3.98, -1.2); g.add(fluid);
          const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-2.3, 3.7, -1.2), new THREE.Vector3(-1.9, 2.6, -0.9), new THREE.Vector3(-0.8, 2.4, -0.5)]), 16, 0.018, 6), glassMat(0xe2e8f0, 0.6)); g.add(line);
          const tray = new THREE.Mesh(roundedBox(1.4, 0.06, 0.9, 0.02), std(0xd8dee6, 0.18, 0.95)); tray.position.set(2.4, 1.9, 1.4); g.add(tray);
          const trayLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.85, 8), std(0xaab3bf, 0.3, 0.9)); trayLeg.position.set(2.4, 0.95, 1.4); g.add(trayLeg);
          for (let k = 0; k < 4; k++) { const tool = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.8, 6), std(0xf1f5f9, 0.12, 1)); tool.rotation.z = Math.PI / 2; tool.position.set(2.4, 1.96, 1.1 + k * 0.18); g.add(tool); }
        }
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.43, 24, 18), real ? std(0xd9ae88, 0.62, 0, { bumpMap: noiseTex(128, 19, 16, 1.2), bumpScale: 0.1 }) : (drape as THREE.Material));
        head.scale.set(0.95, 1.08, 1.05); head.position.set(0, 2.08, -1.72); g.add(head);
        const pillow = new THREE.Mesh(roundedBox(1.2, 0.18, 1.0, 0.08), real ? std(0xe8edf2, 0.95) : (drape as THREE.Material)); pillow.position.set(0, 1.82, -1.72); g.add(pillow);
        for (const zOff of [-0.3, 0.9]) {
          const strap = new THREE.Mesh(roundedBox(1.95, 0.07, 0.24, 0.03), std(0x1e293b, 0.7)); strap.position.set(0, 2.17 + 0.5, zOff); strap.scale.y = 1; g.add(strap);
          for (const sx of [-1, 1]) { const drop = new THREE.Mesh(roundedBox(0.07, 0.62, 0.24, 0.03), std(0x1e293b, 0.7)); drop.position.set(sx * 0.98, 2.2, zOff); g.add(drop); }
          const buckle = new THREE.Mesh(roundedBox(0.28, 0.05, 0.3, 0.02), std(0xcbd5e1, 0.25, 0.95)); buckle.position.set(0, 2.72 + 0.04, zOff); g.add(buckle);
        }
        topY[i] = 2.85;
        // monitor on a wheeled stand
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 10), std(0xaab3bf, 0.3, 0.9)); pole.position.set(2.7, 1.9, -0.9); g.add(pole);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.12, 5), std(0x2b313a, 0.5, 0.5)); foot.position.set(2.7, 0.18, -0.9); g.add(foot);
        for (let w = 0; w < 5; w++) { const wh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), std(0x111111, 0.6)); wh.position.set(2.7 + Math.cos(w * 1.2566) * 0.62, 0.08, -0.9 + Math.sin(w * 1.2566) * 0.62); g.add(wh); }
        const mon = new THREE.Mesh(roundedBox(2.2, 1.45, 0.24, 0.07), std(0x1b2027, 0.4, 0.4)); mon.position.set(2.7, 3.75, -0.9); mon.rotation.y = -0.45; g.add(mon);
        monitorScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 1.2), new THREE.MeshBasicMaterial({ map: ecg.tex, toneMapped: false }));
        monitorScreen.position.set(0, 0, 0.13); mon.add(monitorScreen);
        if (real) { redBeacon = new THREE.PointLight(0xff2020, 45, 16, 2); redBeacon.position.set(0, 4.2, 0); g.add(redBeacon); }
      } else {
        const phantom = new THREE.Mesh(roundedBox(1.9, 0.95, 1.9, 0.14), std(0x59626e, 0.9, 0, { bumpMap: noiseTex(256, 23, 20, 1.6, [2, 2]), bumpScale: 0.7, map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = "#59626e"; c.fillRect(0, 0, w, h); c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 2; c.beginPath(); c.moveTo(w / 2, 6); c.lineTo(w / 2, h - 6); c.moveTo(6, h / 2); c.lineTo(w - 6, h / 2); c.stroke(); }) }));
        phantom.position.y = 1.72 + 0.475; g.add(phantom); topY[i] = 1.72 + 0.95 + 0.02;
      }
      if (isLocked) { // light-curtain cage with hazard posts
        const hz = canvasTex(32, 128, (c, w, h) => { c.fillStyle = "#facc15"; c.fillRect(0, 0, w, h); c.fillStyle = "#111"; for (let y = -w; y < h; y += 32) { c.beginPath(); c.moveTo(0, y + w); c.lineTo(w, y); c.lineTo(w, y + 16); c.lineTo(0, y + 16 + w); c.fill(); } });
        const postMat = std(0xffffff, 0.5, 0.2, { map: hz });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(roundedBox(0.16, 2.4, 0.16, 0.04), postMat); p.position.set(sx * 1.7, 2.9, sz * 2.15); g.add(p); }
        for (const sx of [-1, 1]) { const bar = new THREE.Mesh(roundedBox(0.12, 0.12, 4.3, 0.03), postMat); bar.position.set(sx * 1.7, 4.1, 0); g.add(bar); }
        for (const sz of [-1, 1]) { const bar = new THREE.Mesh(roundedBox(3.4, 0.12, 0.12, 0.03), postMat); bar.position.set(0, 4.1, sz * 2.15); g.add(bar); }
        const panel = new THREE.Mesh(new THREE.BoxGeometry(3.3, 2.2, 0.04), glassMat(0xffc94d, 0.2)); panel.position.set(0, 2.9, 2.15); g.add(panel);
        const panel2 = panel.clone(); panel2.position.z = -2.15; g.add(panel2);
        topY[i] = 4.2;
      }
    }

    if (isTarget && !isLocked) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.45, 2.75, 56), new THREE.MeshBasicMaterial({ color: real ? 0xef4444 : sand ? 0x4ade80 : toy ? 0xf59e0b : 0xdc2626, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring); targetRing = ring;
    }
    const cs = contactShadow(toy ? 5.6 : 5.4, toy ? 5.6 : 6.4, toy ? 0.32 : 0.55); cs.position.y = 0.02; g.add(cs);
    scene.add(g);
    bayGroups.push(g);
  }

  // ---------- 6-axis articulated arm ----------
  const armRoot = new THREE.Group();
  armRoot.position.set(0, 0, ARM_Z);
  scene.add(armRoot);

  const bodyCol = toy ? 0xf6f2ec : neu ? 0x64748b : 0xe8590c;
  const jointCol = toy ? 0xe0526b : clinical ? 0x232830 : 0x334155;
  const bodyMat = paint(bodyCol, toy ? { roughness: 0.28 } : {});
  const jointMat = std(jointCol, 0.4, 0.55);
  const steel = std(0xc6ccd5, 0.3, 0.95, { roughnessMap: brushedTex(3) });
  const darkMat = std(0x14171c, 0.55, 0.4);

  const baseShadow = contactShadow(8, 8, toy ? 0.4 : 0.6); baseShadow.position.y = 0.02; armRoot.add(baseShadow);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.65, 0.28, 56), std(0x6b7280, 0.35, 0.9)); plate.position.y = 0.14; armRoot.add(plate);
  for (let b = 0; b < 8; b++) { const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 6), steel); const a = (b / 8) * Math.PI * 2; bolt.position.set(Math.cos(a) * 2.2, 0.34, Math.sin(a) * 2.2); armRoot.add(bolt); }
  const pedestal = new THREE.Mesh(lathe([[0.001, 0.28], [2.0, 0.28], [1.95, 0.55], [1.7, 1.4], [1.5, 2.2], [0.001, 2.2]], 48), bodyMat); armRoot.add(pedestal);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.05, 8, 48), darkMat); seam.rotation.x = Math.PI / 2; seam.position.y = 1.5; armRoot.add(seam);

  const turret = new THREE.Group(); turret.position.y = 2.2; armRoot.add(turret);
  const ringJ = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.22, 40), jointMat); ringJ.position.y = 0.11; turret.add(ringJ);
  const turBody = new THREE.Mesh(roundedBox(3.1, 1.75, 2.7, 0.4, 5), bodyMat); turBody.position.y = 1.0; turret.add(turBody);
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.6), new THREE.MeshStandardMaterial({ map: signTex([toy ? "CHEF-BOT" : neu ? "UNIT A" : "MX-6 · 40N"], "rgba(0,0,0,0)", toy ? "#e0526b" : neu ? "#e2e8f0" : "#111827", 512, 160), transparent: true, roughness: 0.4 }));
  decal.position.set(0, 1.05, 1.352); turret.add(decal);
  const turMotor = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.9, 28), jointMat); turMotor.rotation.z = Math.PI / 2; turMotor.position.set(-1.75, 1.3, -0.3); turret.add(turMotor);

  const shoulder = new THREE.Group(); shoulder.position.y = SH_Y - 2.2; turret.add(shoulder);
  const shJoint = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 2.9, 40), jointMat); shJoint.rotation.z = Math.PI / 2; shoulder.add(shJoint);
  const shCap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.4, 32), steel); shCap.rotation.z = Math.PI / 2; shCap.position.x = 1.6; shoulder.add(shCap);
  const upper = new THREE.Mesh(linkGeometry(L1, 1.02, 0.8, 1.55, 0.1), bodyMat); shoulder.add(upper);
  const upperStripe = new THREE.Mesh(roundedBox(1.62, 0.12, 0.05, 0.02), darkMat); upperStripe.position.set(0, L1 * 0.5, 0.0); upper.add(upperStripe);
  const cableCurve = (len: number, x: number) => new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0.9, 0.5), new THREE.Vector3(x + 0.05, len * 0.35, 0.78), new THREE.Vector3(x - 0.02, len * 0.7, 0.72), new THREE.Vector3(x, len - 0.7, 0.5)]);
  shoulder.add(new THREE.Mesh(new THREE.TubeGeometry(cableCurve(L1, 0.95), 24, 0.11, 8), std(0x0b0d10, 0.5, 0.2)));

  const boltRing = (parent: THREE.Object3D, x: number, r: number, n: number) => { for (let b = 0; b < n; b++) { const a = (b / n) * Math.PI * 2, bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 6), steel); bolt.rotation.z = Math.PI / 2; bolt.position.set(x, Math.cos(a) * r, Math.sin(a) * r); parent.add(bolt); } };
  boltRing(shoulder, 1.82, 0.52, 8);
  const elbow = new THREE.Group(); elbow.position.y = L1; shoulder.add(elbow);
  const elJoint = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.0, 36), jointMat); elJoint.rotation.z = Math.PI / 2; elbow.add(elJoint);
  const elCap = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.36, 28), steel); elCap.rotation.z = Math.PI / 2; elCap.position.x = 1.1; elbow.add(elCap);
  boltRing(elbow, 1.3, 0.42, 6);
  const fore = new THREE.Mesh(linkGeometry(L2, 0.84, 0.54, 1.2, 0.09), bodyMat); elbow.add(fore);
  elbow.add(new THREE.Mesh(new THREE.TubeGeometry(cableCurve(L2, 0.7), 24, 0.09, 8), std(0x0b0d10, 0.5, 0.2)));

  const wrist = new THREE.Group(); wrist.position.y = L2; elbow.add(wrist);
  const wr1 = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 1.0, 28), jointMat); wr1.rotation.z = Math.PI / 2; wrist.add(wr1);
  const wr2 = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 18), bodyMat); wr2.position.y = -0.32; wrist.add(wr2);
  const plunger = new THREE.Group(); wrist.add(plunger);
  const ledMat = new THREE.MeshBasicMaterial({ color: toy ? 0xff7ab0 : real ? 0x7dd3fc : sand ? 0x4ade80 : 0x93c5fd, toneMapped: false });
  const led = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 40), ledMat); led.rotation.x = Math.PI / 2; led.position.y = -0.5; plunger.add(led);
  const plate2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 28), steel); plate2.position.y = -0.62; plunger.add(plate2);
  const collet = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.5, 24), darkMat); collet.position.y = -0.92; plunger.add(collet);
  if (toy) { // stainless probe with a rubber grip and a rose tip
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.8, 20), std(0xe0526b, 0.8)); grip.position.y = -1.5; plunger.add(grip);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.75, 14), steel); rod.position.y = -2.0; plunger.add(rod);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), paint(0xff4d6d)); tip.position.y = -2.27; plunger.add(tip);
  } else { // instrument holder with a tapered blade
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.62, 20), steel); holder.position.y = -1.38; plunger.add(holder);
    const bs = new THREE.Shape(); bs.moveTo(-0.17, 0); bs.lineTo(0.17, 0); bs.lineTo(0.17, -1.05); bs.quadraticCurveTo(0.14, -1.5, -0.02, -1.78); bs.lineTo(-0.17, -1.2); bs.closePath();
    const bg = new THREE.ExtrudeGeometry(bs, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
    const blade = new THREE.Mesh(bg, std(0xf1f5f9, 0.1, 1, { emissive: real ? 0x5a0f0f : 0x000000, emissiveIntensity: 0.4, envMapIntensity: 1.6 }));
    blade.position.set(0, -0.62 - 0.0, -0.02); blade.position.y = -0.6; plunger.add(blade);
  }

  scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { const m = o as THREE.Mesh, mt = m.material as THREE.Material; if (!(mt as THREE.MeshBasicMaterial).isMeshBasicMaterial && !(mt as any).transparent) { m.castShadow = true; } m.receiveShadow = true; } });

  const fx: {
    yaw: number; d: number; hw: number; curPlunge: number; plunged: boolean;
    confetti: { pts: THREE.Points; geo: THREE.BufferGeometry; v: Float32Array; n: number; t0: number } | null;
    shock: { mesh: THREE.Mesh; t0: number } | null; shake: number; ecgAt: number;
  } = { yaw: 0, d: 3.4, hw: 11.2, curPlunge: 0, plunged: false, confetti: null, shock: null, shake: 0, ecgAt: -1 };

  const post = makePost(renderer, scene, camera, toy ? { ao: 1.0, aoRadius: 1.6 } : real ? { ao: 1.0, aoRadius: 1.4, bloom: 0.35, bloomThreshold: 1.4, bloomRadius: 0.35 } : sand ? { ao: 0.9, bloom: 0.3, bloomThreshold: 1.4 } : { ao: 0.8 });
  const resize = fitToContainer(container, renderer, camera, post);
  resize();

  function triggerEffect(t: number, snap: SelectSnap) {
    const p = slotPos(snap.doneAt ?? snap.target);
    const hit = snap.doneAt === snap.target;
    if (toy && hit) {
      const n = 220, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), v = new Float32Array(n * 3);
      const pal = [[1, 0.3, 0.5], [1, 0.85, 0.1], [0.2, 0.9, 0.5], [0.3, 0.75, 1]];
      for (let i = 0; i < n; i++) {
        pos[i * 3] = p.x; pos[i * 3 + 1] = 2.8; pos[i * 3 + 2] = p.z;
        const a = Math.random() * 6.28, sp = 2 + Math.random() * 6;
        v[i * 3] = Math.cos(a) * sp; v[i * 3 + 1] = 6 + Math.random() * 8; v[i * 3 + 2] = Math.sin(a) * sp;
        col.set(pal[i % 4], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.38, vertexColors: true }));
      scene.add(pts);
      fx.confetti = { pts, geo, v, n, t0: t };
    } else if (hit && clinical) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.2, 48), new THREE.MeshBasicMaterial({ color: real ? 0xff2020 : 0x4ade80, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, 2.0, p.z);
      scene.add(m);
      fx.shock = { mesh: m, t0: t };
      if (real) fx.shake = 1.2;
    }
    ev.onLand(hit);
  }

  function frame(snap: SelectSnap, dt: number, t: number) {
    if (!snap.done) fx.plunged = false;
    const k = 1 - Math.exp(-dt * 4.5);
    const sel = snap.selected ?? snap.doneAt ?? null;
    let gy = 0, gd = 3.4, gh = 11.2; // parked
    if (sel !== null && (snap.open || snap.done)) { gy = slotYaw(sel); gd = slotReach(sel); gh = (topY[sel] ?? 2.3) + HOVER + TOOL; }
    else if (snap.open) { gy = 0; gd = 8.2; gh = 10.4; }

    fx.yaw += (gy - fx.yaw) * k;
    fx.d += (gd - fx.d) * k;
    fx.hw += (gh - fx.hw) * k;
    const aligned = sel !== null && Math.abs(fx.yaw - gy) < 0.06 && Math.abs(fx.d - gd) < 0.35 && Math.abs(fx.hw - gh) < 0.35;
    const plungeGoal = snap.done && aligned ? 1.0 : 0.0;
    fx.curPlunge += (plungeGoal - fx.curPlunge) * Math.min(1, dt * 5);
    // The probe does not slide out of the wrist: the whole arm lowers it. The wrist target drops by the plunge depth and the joints follow.
    const depth = PLUNGE * fx.curPlunge * fx.curPlunge * (3 - 2 * fx.curPlunge);
    const { t1, t2 } = solveIK(fx.d, fx.hw - depth - SH_Y);
    turret.rotation.y = fx.yaw;
    shoulder.rotation.x = t1;
    elbow.rotation.x = t2;
    wrist.rotation.x = -(t1 + t2); // keeps the tool pointing straight down

    if (snap.done && aligned && fx.curPlunge > 0.9 && !fx.plunged) { fx.plunged = true; triggerEffect(t, snap); }

    if (chestMesh) {
      const rate = fx.plunged && real ? 16 : 3.7;
      chestMesh.scale.z = 0.86 * (1 + Math.sin(t * rate) * 0.04);
    }
    if (monitorScreen && t - fx.ecgAt > 0.05) { fx.ecgAt = t; ecg.draw(t, fx.plunged && real, false); }
    if (real) ledMat.color.setHex(fx.plunged ? (Math.sin(t * 12) > 0 ? 0xff2020 : 0x550000) : snap.open ? 0xfbbf24 : 0x7dd3fc);
    if (redBeacon) redBeacon.intensity = (fx.plunged ? 90 : 35) + 40 * Math.max(0, Math.sin(t * (fx.plunged ? 14 : 5)));
    if (targetRing) (targetRing.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.35 * Math.sin(t * 4);

    if (fx.confetti) {
      const c = fx.confetti, a = c.geo.attributes.position, age = t - c.t0;
      for (let i = 0; i < c.n; i++) {
        a.array[i * 3] += c.v[i * 3] * dt;
        a.array[i * 3 + 1] += (c.v[i * 3 + 1] - 9.8 * age) * dt;
        a.array[i * 3 + 2] += c.v[i * 3 + 2] * dt;
      }
      a.needsUpdate = true;
      if (age > 3.2) { scene.remove(c.pts); fx.confetti = null; }
    }
    if (fx.shock) {
      const age = t - fx.shock.t0, m = fx.shock.mesh;
      m.scale.setScalar(1 + age * 5.5);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - age * 0.55);
      if (age > 1.8) { scene.remove(m); fx.shock = null; }
    }
    fx.shake *= Math.exp(-dt * 3.5);

    camera.position.set(Math.sin(t * 0.16) * 1.6 + (Math.random() - 0.5) * fx.shake, 13.4 + (Math.random() - 0.5) * fx.shake, 25.2);
    camera.lookAt(0, 4.2, 1.6);
    post.render();
  }

  return {
    frame,
    resize,
    snapshotJpeg: () => canvas.toDataURL("image/jpeg", 0.6),
    dispose() { post.dispose(); disposeRenderer(renderer, canvas); },
  };
}
