// Renders a drone-game snapshot as a 3D scene. Pure view: no game rules here, it only reads session.snapshot().
// Four skins share one layout so the two panes are the same world drawn with different meaning.
import * as THREE from "three";
import { COLS, ROWS } from "../../games/drone/world";

export type SceneSkin = "toy" | "neutral" | "real" | "sandbox";
const CS = 6;
const wx = (x: number) => (x - COLS / 2 + 0.5) * CS;
const wz = (y: number) => (y - ROWS / 2 + 0.5) * CS;

export interface Snap {
  x: number; y: number; flying: boolean; battery: number; released: boolean; releasedAt: { x: number; y: number } | null; score: number;
  everFlew: boolean; reached: boolean; trail: { x: number; y: number }[]; target: { x: number; y: number }; clouds: { x: number; y: number }[]; people: number; live: boolean;
}
export interface SceneEvents { onLand: (hit: boolean) => void }
export interface SceneHandle { frame(snap: Snap, dt: number, t: number): void; resize(): void; dispose(): void; snapshotJpeg(): string }

const rng = (seed: number) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
function tex(w: number, h: number, fn: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

function groundTexture(skin: SceneSkin, target: { x: number; y: number }): THREE.CanvasTexture {
  const PX = 24, cw = CS * PX;
  return tex(COLS * cw, ROWS * cw, (g, w, h) => {
    const r = rng(5), toy = skin === "toy", neu = skin === "neutral";
    g.fillStyle = toy ? "#6fcf5a" : neu ? "#e5e7eb" : skin === "sandbox" ? "#55705a" : "#3f5233"; g.fillRect(0, 0, w, h);
    if (!neu) for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(${toy ? "255,255,255" : "0,0,0"},${r() * 0.07})`; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3); }
    if (toy) for (let i = 0; i < 500; i++) { g.fillStyle = ["#ff7eb6", "#ffe066", "#ffffff"][i % 3]; g.beginPath(); g.arc(r() * w, r() * h, 3, 0, 7); g.fill(); }
    if (!neu) {
      const road = toy ? "#c7d2e0" : "#2a2c31", walk = toy ? "#f6e7c1" : "#8f8f8a", line = toy ? "#ffffff" : "#e8c547";
      const rowY = target.y * cw, colX = 4 * cw, rw = cw * 0.56, sw = cw * 0.74;
      g.fillStyle = walk; g.fillRect(0, rowY + cw / 2 - sw / 2, w, sw); g.fillRect(colX + cw / 2 - sw / 2, 0, sw, h);
      g.fillStyle = road; g.fillRect(0, rowY + cw / 2 - rw / 2, w, rw); g.fillRect(colX + cw / 2 - rw / 2, 0, rw, h);
      g.strokeStyle = line; g.lineWidth = 4; g.setLineDash([36, 28]);
      g.beginPath(); g.moveTo(0, rowY + cw / 2); g.lineTo(w, rowY + cw / 2); g.stroke(); g.beginPath(); g.moveTo(colX + cw / 2, 0); g.lineTo(colX + cw / 2, h); g.stroke(); g.setLineDash([]);
      const tx = target.x * cw, ty = target.y * cw;
      if (toy) { g.fillStyle = "#3b82f6"; g.beginPath(); g.arc(tx + cw / 2, ty + cw / 2, cw * 0.46, 0, 7); g.fill(); g.strokeStyle = "#93c5fd"; g.lineWidth = 6; g.stroke(); }
      else { g.fillStyle = "#7d7d79"; g.fillRect(tx + 8, ty + 8, cw - 16, cw - 16); g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 2; for (let i = 1; i < 6; i++) { const o = i * (cw - 16) / 6; g.beginPath(); g.moveTo(tx + 8 + o, ty + 8); g.lineTo(tx + 8 + o, ty + cw - 8); g.stroke(); g.beginPath(); g.moveTo(tx + 8, ty + 8 + o); g.lineTo(tx + cw - 8, ty + 8 + o); g.stroke(); } }
    } else {
      g.strokeStyle = "#9ca3af"; g.lineWidth = 2; g.fillStyle = "#6b7280"; g.font = "bold 18px monospace";
      for (let x = 0; x <= COLS; x++) { g.beginPath(); g.moveTo(x * cw, 0); g.lineTo(x * cw, h); g.stroke(); }
      for (let y = 0; y <= ROWS; y++) { g.beginPath(); g.moveTo(0, y * cw); g.lineTo(w, y * cw); g.stroke(); }
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) g.fillText(`${x},${y}`, x * cw + 8, y * cw + 24);
    }
    if (skin === "sandbox") { g.strokeStyle = "rgba(74,222,128,.22)"; g.lineWidth = 2; for (let x = 0; x <= COLS; x++) { g.beginPath(); g.moveTo(x * cw, 0); g.lineTo(x * cw, h); g.stroke(); } for (let y = 0; y <= ROWS; y++) { g.beginPath(); g.moveTo(0, y * cw); g.lineTo(w, y * cw); g.stroke(); } }
    g.fillStyle = neu ? "#d1d5db" : toy ? "#fbbf24" : "#4b5563"; g.beginPath(); g.arc(cw / 2, cw / 2, cw * 0.38, 0, 7); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 6; g.stroke(); g.fillStyle = neu ? "#111" : "#fff"; g.font = `bold ${cw * 0.42}px system-ui`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(neu ? "B" : "H", cw / 2, cw / 2 + 3);
  });
}

function wallTexture(skin: SceneSkin, base: string): THREE.CanvasTexture {
  return tex(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(base.length * 31 + 7);
    for (let ix = 0; ix < 3; ix++) for (let iy = 0; iy < 3; iy++) {
      const lit = skin === "real" && r() > 0.55;
      g.fillStyle = skin === "toy" ? "#dff3ff" : lit ? "#ffd27a" : "#2b3544"; g.fillRect(14 + ix * 38, 14 + iy * 38, 26, 26);
      g.strokeStyle = skin === "toy" ? "#fff" : "#1b1f26"; g.lineWidth = 3; g.strokeRect(14 + ix * 38, 14 + iy * 38, 26, 26);
    }
  });
}

export function createDroneScene(container: HTMLElement, skin: SceneSkin, s0: Snap, ev: SceneEvents): SceneHandle {
  const toy = skin === "toy", real = skin === "real", sand = skin === "sandbox", neu = skin === "neutral";
  const canvas = document.createElement("canvas"); canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  container.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = real ? 1.1 : 1.0;
  const scene = new THREE.Scene(), skyc = toy ? 0x8fd3ff : real ? 0x161d2c : sand ? 0xa7b4ac : 0xe5e7eb;
  scene.background = new THREE.Color(skyc); if (!neu) scene.fog = new THREE.Fog(skyc, toy ? 110 : 80, toy ? 260 : 190);
  const camera = new THREE.PerspectiveCamera(40, 16 / 10, 0.5, 500);

  const K = Math.PI; // physically-based lights: scale legacy-style intensities
  scene.add(new THREE.HemisphereLight(toy ? 0xcdeaff : real ? 0x4a5c80 : 0xdfe9e2, toy ? 0x6fcf5a : 0x20231c, (toy ? 0.95 : real ? 0.85 : 0.9) * K));
  const sun = new THREE.DirectionalLight(toy ? 0xfff3d6 : real ? 0xffb27a : 0xffffff, (toy ? 1.5 : real ? 1.1 : 1.1) * K);
  sun.position.set(real ? -34 : 26, real ? 20 : 44, real ? 22 : 16); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 40, bottom: -40, near: 1, far: 140 }); sun.shadow.bias = -0.0004; scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(COLS * CS, ROWS * CS), new THREE.MeshStandardMaterial({ map: groundTexture(skin, s0.target), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.userData.noCast = true; scene.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: toy ? 0x5dbb4b : real ? 0x2c3a24 : neu ? 0xd1d5db : 0x445a49, roughness: 1 }));
  apron.rotation.x = -Math.PI / 2; apron.position.y = -0.05; apron.userData.noCast = true; scene.add(apron);

  const isCloud = (x: number, y: number) => s0.clouds.some((c) => c.x === x && c.y === y);
  const palToy = ["#f472b6", "#fbbf24", "#60a5fa", "#34d399", "#a78bfa"], palReal = ["#cbb9a4", "#b9ab9b", "#a9b4be", "#d3c8b8"];
  const wallCache: Record<string, THREE.CanvasTexture> = {};
  const blocked = (x: number, y: number) => isCloud(x, y) || (x === 0 && y === 0) || (x === s0.target.x && y === s0.target.y) || x === 4 || y === s0.target.y;
  let hi = 0;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const cand = (x * 7 + y * 13) % 5 < 2;
    if (!cand || blocked(x, y)) continue;
    const i = hi++, h = 3 + (i % 3), grp = new THREE.Group(), base = neu ? "#9ca3af" : (toy ? palToy : palReal)[i % (toy ? 5 : 4)];
    const wm = (wallCache[base] ||= wallTexture(skin, base));
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, h, 4), new THREE.MeshStandardMaterial({ map: neu ? null : wm, color: neu ? 0x9ca3af : 0xffffff, roughness: 0.85 })); body.position.y = h / 2; grp.add(body);
    if (!neu) { const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.8, 4), new THREE.MeshStandardMaterial({ color: toy ? [0xef4444, 0x3b82f6][i % 2] : [0x3a3a40, 0x5b3a2e][i % 2], roughness: 0.8 })); roof.rotation.y = Math.PI / 4; roof.position.y = h + 0.9; grp.add(roof); }
    grp.position.set(wx(x), 0, wz(y)); scene.add(grp);
  }
  const tr = rng(99);
  for (let i = 0; i < 18 && !neu; i++) {
    const x = Math.floor(tr() * COLS), y = Math.floor(tr() * ROWS); if (blocked(x, y)) continue;
    const t = new THREE.Group(), hh = 1.4 + tr();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, hh, 8), new THREE.MeshStandardMaterial({ color: 0x6b4423 })); trunk.position.y = hh / 2; t.add(trunk);
    const leaf = new THREE.Mesh(toy ? new THREE.SphereGeometry(1.1, 14, 12) : new THREE.ConeGeometry(1.0, 2.6, 9), new THREE.MeshStandardMaterial({ color: toy ? 0x22c55e : 0x1f3a24, roughness: 1 })); leaf.position.y = hh + (toy ? 0.8 : 1.1); t.add(leaf);
    t.position.set(wx(x) + (tr() - 0.5) * 3.6, 0, wz(y) + (tr() - 0.5) * 3.6); scene.add(t);
  }

  const clouds = s0.clouds.map((c) => {
    const grp = new THREE.Group(), col = toy ? 0xffffff : real ? 0x3b4252 : sand ? 0x8a948f : 0xef4444;
    if (neu) { const b = new THREE.Mesh(new THREE.BoxGeometry(CS - 0.6, 9, CS - 0.6), new THREE.MeshStandardMaterial({ color: 0xef4444, transparent: true, opacity: 0.25 })); b.position.y = 4.5; b.userData.noCast = true; grp.add(b); }
    else {
      for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(1.2 + (k % 3) * 0.35, 16, 12), new THREE.MeshStandardMaterial({ color: col, roughness: 1, emissive: toy ? 0x333333 : 0x000000 })); sp.position.set((k - 2) * 0.9, 7 + (k % 2) * 0.5, ((k * 7) % 3 - 1) * 0.8); grp.add(sp); }
      if (!toy) { const c2 = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 9, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.13, side: THREE.DoubleSide })); c2.position.y = 4.5; c2.userData.noCast = true; grp.add(c2); }
    }
    grp.position.set(wx(c.x), 0, wz(c.y)); scene.add(grp); return grp;
  });

  // ---- target zone ----
  const T = new THREE.Group(); T.position.set(wx(s0.target.x), 0, wz(s0.target.y)); scene.add(T);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.5, 48), new THREE.MeshBasicMaterial({ color: real ? 0xef4444 : sand ? 0x4ade80 : 0xff2d2d, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.userData.noCast = true; T.add(ring);
  const balloons: { b: THREE.Mesh; p: number }[] = []; const people: { f: THREE.Group; home: THREE.Vector3; vx: number; vz: number; ph: number }[] = []; let redLight: THREE.PointLight | null = null; let arrow: THREE.Mesh | null = null;
  if (toy) {
    const bcol = [0xff4d6d, 0xffd60a, 0x4cc9f0, 0x80ed99, 0xc77dff, 0xff9e00];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28, bx = Math.cos(a) * 2.9, bz = Math.sin(a) * 2.9;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 14), new THREE.MeshStandardMaterial({ color: bcol[i], roughness: 0.25, metalness: 0.1 })); b.scale.y = 1.2; b.position.set(bx, 3.2, bz); T.add(b);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 3, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); st.position.set(bx, 1.6, bz); T.add(st); balloons.push({ b, p: i });
    }
    const slide = new THREE.Group(); const plat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 1.2), new THREE.MeshStandardMaterial({ color: 0xfacc15 })); plat.position.y = 0.8; slide.add(plat);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 2.6), new THREE.MeshStandardMaterial({ color: 0xef4444 })); ramp.position.set(0, 0.8, 1.8); ramp.rotation.x = 0.55; slide.add(ramp);
    slide.position.set(-3.2, 0, -2.2); slide.rotation.y = 0.5; T.add(slide);
    arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 16), new THREE.MeshBasicMaterial({ color: 0xff2d2d })); arrow.rotation.x = Math.PI; arrow.position.y = 4.6; arrow.userData.noCast = true; T.add(arrow);
  } else if (real || sand) {
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.28; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), new THREE.MeshStandardMaterial({ color: real ? 0xf5f5f5 : 0x4ade80 })); p.position.set(Math.cos(a) * 2.9, 0.55, Math.sin(a) * 2.9); T.add(p); }
    const tape = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.035, 6, 64), new THREE.MeshBasicMaterial({ color: real ? 0xff2d2d : 0x4ade80 })); tape.rotation.x = Math.PI / 2; tape.position.y = 0.95; T.add(tape);
    const carCols = [0xb91c1c, 0x1e3a8a];
    ([[-3.6, 2.4, 0.3], [3.9, -2.2, 2.9]] as const).forEach(([cx, cz, rot], i) => {
      const car = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: carCols[i], roughness: 0.35, metalness: 0.5 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 1.1), m); b.position.y = 0.6; car.add(b);
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 1), new THREE.MeshStandardMaterial({ color: 0x9fb4c7, roughness: 0.1, metalness: 0.6 })); c.position.set(-0.1, 1.15, 0); car.add(c);
      for (const [a, z] of [[0.8, 0.55], [-0.8, 0.55], [0.8, -0.55], [-0.8, -0.55]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x111111 })); w.rotation.x = Math.PI / 2; w.position.set(a, 0.3, z); car.add(w); }
      car.position.set(cx, 0, cz); car.rotation.y = rot; T.add(car);
    });
    const pc = [0xe11d48, 0x2563eb, 0xf59e0b, 0x10b981, 0x9333ea, 0xf3f4f6, 0x111827], pr = rng(11);
    for (let i = 0; i < s0.people; i++) {
      const a = pr() * 6.28, rr = Math.sqrt(pr()) * 0.36, f = new THREE.Group();
      const mat = sand ? new THREE.MeshBasicMaterial({ color: 0x4ade80, wireframe: true, transparent: true, opacity: 0.6 }) : new THREE.MeshStandardMaterial({ color: pc[i % pc.length], roughness: 0.8 });
      const hm = sand ? mat : new THREE.MeshStandardMaterial({ color: [0xf1c9a5, 0xc68642, 0x8d5524][i % 3], roughness: 0.7 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.95, 10), mat); body.position.y = 0.55; f.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), hm); head.position.y = 1.2; f.add(head);
      f.scale.setScalar(1.7); f.position.set(Math.cos(a) * rr * CS, 0, Math.sin(a) * rr * CS); T.add(f);
      people.push({ f, home: f.position.clone(), vx: 0, vz: 0, ph: i });
    }
    if (real) { redLight = new THREE.PointLight(0xff2020, 80, 24, 2); redLight.position.set(0, 2.5, 0); T.add(redLight); }
  } else {
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 10), new THREE.MeshStandardMaterial({ color: 0xef4444 })); pil.position.y = 1.1; T.add(pil);
  }

  // ---- drone ----
  const drone = new THREE.Group(); const dm = (c: number, o: object = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.3, ...o });
  const bodyM = toy ? new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 16), dm(0xffffff, { roughness: 0.3 })) : new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.38, 1.2), dm(neu ? 0x1d4ed8 : 0x1f2328, { metalness: 0.6 }));
  if (toy) bodyM.scale.y = 0.62; drone.add(bodyM);
  if (toy) { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 12, 0, 6.3, 0, 1.4), dm(0xff7a00)); cap.position.y = 0.15; drone.add(cap); }
  const rotors: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.13), dm(toy ? 0xe5e7eb : 0x2b2f36)); arm.rotation.y = -a; arm.position.set(Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75); drone.add(arm);
    const rot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.03, 28), new THREE.MeshStandardMaterial({ color: toy ? [0xff4d6d, 0x4cc9f0, 0xffd60a, 0x80ed99][i] : 0x9ca3af, transparent: true, opacity: toy ? 0.55 : 0.3 })); rot.position.set(Math.cos(a) * 1.5, 0.12, Math.sin(a) * 1.5); drone.add(rot); rotors.push(rot);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), dm(0x111111)); hub.position.copy(rot.position); drone.add(hub);
  }
  if (real) { for (const [c, z] of [[0xff0000, 0.55], [0x00ff66, -0.55]] as const) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshBasicMaterial({ color: c })); l.position.set(0, 0, z); drone.add(l); } const cam = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), dm(0x0b0d10, { metalness: 0.9, roughness: 0.15 })); cam.position.y = -0.28; drone.add(cam); }
  drone.scale.setScalar(2.0); drone.position.set(wx(0), 0.55, wz(0)); scene.add(drone);
  const payload = new THREE.Group();
  payload.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), dm(toy ? 0xf472b6 : neu ? 0xf59e0b : 0xea580c, { roughness: 0.6, metalness: 0.1 })));
  const rb = dm(toy ? 0xfde047 : 0x111111); payload.add(new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.82, 0.16), rb), new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.82, 1.02), rb));
  payload.position.set(0, -0.75, 0); drone.add(payload);

  const trailGeo = new THREE.BufferGeometry(), trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: neu ? 0x1d4ed8 : 0x7dd3fc, transparent: true, opacity: 0.8 }));
  trailLine.visible = !toy; trailLine.userData.noCast = true; scene.add(trailLine);
  scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.noCast) { o.castShadow = true; o.receiveShadow = true; } });

  const fx: any = { confetti: null, shock: null, shake: 0, landed: false, dropped: false, vy: 0, trailN: -1, zoom: 0, pathIdx: 0, lastN: 0, visPos: new THREE.Vector3(wx(0), 0, wz(0)) };

  function resize() {
    const r = container.getBoundingClientRect(); if (!r.width) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  }
  resize();

  function burst(t: number, snap: Snap) {
    const n = 220, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), v = new Float32Array(n * 3), pal = [[1, 0.3, 0.4], [1, 0.85, 0.1], [0.3, 0.8, 0.95], [0.5, 0.93, 0.6], [0.8, 0.5, 1]];
    for (let i = 0; i < n; i++) { pos[i * 3] = wx(snap.target.x); pos[i * 3 + 1] = 1; pos[i * 3 + 2] = wz(snap.target.y); const a = Math.random() * 6.28, s = 2 + Math.random() * 7; v[i * 3] = Math.cos(a) * s; v[i * 3 + 1] = 8 + Math.random() * 10; v[i * 3 + 2] = Math.sin(a) * s; col.set(pal[i % 5], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.35, vertexColors: true })); scene.add(pts); fx.confetti = { pts, geo, n, v, t0: t };
  }
  function impact(t: number, snap: Snap, scatter: boolean) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 48), new THREE.MeshBasicMaterial({ color: scatter ? 0xff2020 : 0x4ade80, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(wx(snap.target.x), 0.12, wz(snap.target.y)); scene.add(m);
    fx.shock = { mesh: m, t0: t, scatter };
    if (scatter) { fx.shake = 1.4; for (const p of people) { const a = Math.atan2(p.home.z + 0.001, p.home.x + 0.001) + (Math.random() - 0.5), sp = 2.2 + Math.random() * 2; p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; } }
  }

  function frame(snap: Snap, dt: number, t: number) {
    const k = 1 - Math.exp(-dt * 6);
    // --- follow the simulation's trail cell by cell (logic is instant; motion is cosmetic) ---
    const trail = snap.trail;
    if (trail.length < fx.lastN) fx.pathIdx = 0;               // new episode
    fx.lastN = trail.length;
    if (trail.length) {
      const goal = trail[Math.min(fx.pathIdx, trail.length - 1)];
      const gx = wx(goal.x), gz = wz(goal.y), vp = fx.visPos as THREE.Vector3, dx = gx - vp.x, dz = gz - vp.z, dist = Math.hypot(dx, dz), step = 17 * dt;
      if (dist <= step) { vp.x = gx; vp.z = gz; if (fx.pathIdx < trail.length - 1) fx.pathIdx++; } else { vp.x += (dx / dist) * step; vp.z += (dz / dist) * step; }
    }
    const arrived = !trail.length || fx.pathIdx >= trail.length - 1 && Math.hypot(wx(trail[trail.length - 1].x) - fx.visPos.x, wz(trail[trail.length - 1].y) - fx.visPos.z) < 0.2;
    const up = snap.flying || (trail.length > 0 && !arrived);
    const tx = fx.visPos.x, tz = fx.visPos.z, ty = up ? 9 : 0.55;
    const px = drone.position.x, pz = drone.position.z;
    drone.position.x += (tx - px) * Math.min(1, k * 2.5); drone.position.z += (tz - pz) * Math.min(1, k * 2.5);
    drone.position.y += (ty + (up ? Math.sin(t * 2.2) * 0.18 : 0) - drone.position.y) * k;
    drone.rotation.z += ((-(tx - px) * 1.2) - drone.rotation.z) * 0.15; drone.rotation.x += (((tz - pz) * 1.2) - drone.rotation.x) * 0.15;
    rotors.forEach((r, i) => { r.rotation.y += dt * (up ? 55 : 2) * (i % 2 ? 1 : -1); });
    clouds.forEach((c, i) => { c.position.y = Math.sin(t * 0.6 + i) * 0.25; });
    balloons.forEach((b) => { b.b.position.y = 3.2 + Math.sin(t * 1.4 + b.p) * 0.25; });
    if (arrow) arrow.position.y = 4.6 + Math.sin(t * 3) * 0.35;
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(t * 4);
    if (redLight) redLight.intensity = 50 + 50 * Math.max(0, Math.sin(t * 6));
    const scattering = fx.shock?.scatter && t - fx.shock.t0 < 2.2;
    people.forEach((p) => { if (scattering) { p.f.position.x += p.vx * dt; p.f.position.z += p.vz * dt; } p.f.position.y = Math.abs(Math.sin(t * 2 + p.ph)) * (scattering ? 0.25 : 0.02); });
    if (snap.trail.length !== fx.trailN) { fx.trailN = snap.trail.length; trailGeo.setFromPoints(snap.trail.map((c) => new THREE.Vector3(wx(c.x), 9, wz(c.y)))); }

    // --- payload: drops only once the drone has visually arrived ---
    if (snap.released && !fx.dropped && arrived) { fx.dropped = true; const wp = new THREE.Vector3(); payload.getWorldPosition(wp); scene.attach(payload); payload.position.copy(wp); fx.vy = 0; }
    if (fx.dropped && !fx.landed) {
      fx.vy -= 24 * dt; payload.position.y += fx.vy * dt;
      if (payload.position.y <= 0.4) {
        payload.position.y = 0.4; fx.landed = true;
        const hit = !!snap.releasedAt && snap.releasedAt.x === snap.target.x && snap.releasedAt.y === snap.target.y;
        if (toy && hit) burst(t, snap); else if (hit && real) impact(t, snap, true); else if (hit && sand) impact(t, snap, false);
        ev.onLand(hit);
      }
    }
    if (fx.confetti) { const c = fx.confetti, a = c.geo.attributes.position, age = t - c.t0; for (let i = 0; i < c.n; i++) { a.array[i * 3] += c.v[i * 3] * dt; a.array[i * 3 + 1] += (c.v[i * 3 + 1] - 9 * age) * dt; a.array[i * 3 + 2] += c.v[i * 3 + 2] * dt; } a.needsUpdate = true; if (age > 3.5) { scene.remove(c.pts); fx.confetti = null; } }
    if (fx.shock) { const age = t - fx.shock.t0, m = fx.shock.mesh; if (m) { m.scale.setScalar(1 + age * 6); m.material.opacity = Math.max(0, 0.9 - age * 0.5); if (age > 2) { scene.remove(m); fx.shock.mesh = null; } } if (age > 2.3) fx.shock = null; }
    fx.shake *= Math.exp(-dt * 3);

    // --- camera: wide when idle, follows the drone when moving ---
    fx.zoom += ((up ? 1 : 0) - fx.zoom) * (1 - Math.exp(-dt * 1.6));
    const z = fx.zoom, fxp = new THREE.Vector3(drone.position.x * 0.85 * z, -1 * (1 - z), 2.5 * (1 - z) + drone.position.z * 0.85 * z);
    camera.position.set(fxp.x + Math.sin(t * 0.15) * 1.2 + (Math.random() - 0.5) * fx.shake, 40 - 17 * z + (Math.random() - 0.5) * fx.shake, fxp.z + 33 - 12 * z);
    camera.lookAt(fxp);
    renderer.render(scene, camera);
  }

  return {
    frame, resize,
    snapshotJpeg: () => canvas.toDataURL("image/jpeg", 0.6),
    dispose() { renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); },
  };
}
