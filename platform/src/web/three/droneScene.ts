// Renders a drone-game snapshot as a 3D scene. Pure view: no game rules here, it only reads session.snapshot().
// Four skins share one layout so the two panes are the same world drawn with different meaning:
// "toy" = sunny miniature town, "real" = dusk city block, "neutral" = plain grey study model, "sandbox" = green holo overlay.
import * as THREE from "three";
import { COLS, ROWS } from "../../games/drone/world";
import { applyEnvironment, boxTex, canvasTex, disposeRenderer, facadeGlowTex, facadeTex, fitToContainer, gradientBackground, makeCanvas, makeRenderer, noiseTex, paint, rng, roofTex, roundedBox, std } from "./realism";

export type SceneSkin = "toy" | "neutral" | "real" | "sandbox";
const CS = 6;
const wx = (x: number) => (x - COLS / 2 + 0.5) * CS;
const wz = (y: number) => (y - ROWS / 2 + 0.5) * CS;

export interface Snap {
  x: number; y: number; flying: boolean; battery: number; released: boolean; releasedAt: { x: number; y: number } | null; score: number;
  everFlew: boolean; reached: boolean; trail: { x: number; y: number }[]; target: { x: number; y: number }; clouds: { x: number; y: number }[]; people: number; live: boolean;
}
export interface SceneEvents { onLand: (hit: boolean) => void }
export interface SceneHandle<S = Snap> { frame(snap: S, dt: number, t: number): void; resize(): void; dispose(): void; snapshotJpeg(): string }


function groundTexture(skin: SceneSkin, target: { x: number; y: number }): THREE.CanvasTexture {
  const PX = 24, cw = CS * PX;
  return canvasTex(COLS * cw, ROWS * cw, (g, w, h) => {
    const r = rng(5), toy = skin === "toy", neu = skin === "neutral", real = skin === "real";
    g.fillStyle = toy ? "#6cc455" : neu ? "#e5e7eb" : skin === "sandbox" ? "#3f5a4a" : "#3e443f"; g.fillRect(0, 0, w, h);
    if (toy) { // mown stripes + clover
      for (let y = 0; y < h; y += cw / 2) { g.fillStyle = (y / (cw / 2)) % 2 ? "rgba(255,255,255,.06)" : "rgba(0,70,0,.05)"; g.fillRect(0, y, w, cw / 2); }
    }
    if (!neu) for (let i = 0; i < 52000; i++) { g.fillStyle = `rgba(${toy ? "255,255,210" : "0,0,0"},${r() * (toy ? 0.09 : 0.1)})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    if (toy) for (let i = 0; i < 900; i++) { g.fillStyle = ["#ff8fc2", "#ffe066", "#ffffff", "#c4b5fd"][i % 4]; g.beginPath(); g.arc(r() * w, r() * h, 2.2 + r() * 1.6, 0, 7); g.fill(); }
    if (!neu) {
      const road = toy ? "#a9b3c2" : "#23262b", walk = toy ? "#f2e4bd" : "#85857f", line = toy ? "#ffffff" : "#e6c24a";
      const rowY = target.y * cw, colX = 4 * cw, rw = cw * 0.56, sw = cw * 0.76;
      g.fillStyle = walk; g.fillRect(0, rowY + cw / 2 - sw / 2, w, sw); g.fillRect(colX + cw / 2 - sw / 2, 0, sw, h);
      for (const [x0, y0, x1, y1] of [[0, rowY + cw / 2 - sw / 2, w, rowY + cw / 2 - sw / 2 + 2], [0, rowY + cw / 2 + sw / 2 - 2, w, rowY + cw / 2 + sw / 2], [colX + cw / 2 - sw / 2, 0, colX + cw / 2 - sw / 2 + 2, h], [colX + cw / 2 + sw / 2 - 2, 0, colX + cw / 2 + sw / 2, h]]) { g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
      g.fillStyle = road; g.fillRect(0, rowY + cw / 2 - rw / 2, w, rw); g.fillRect(colX + cw / 2 - rw / 2, 0, rw, h);
      for (let i = 0; i < 30000; i++) { g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},${r() * 0.08})`; const horiz = r() > 0.5; g.fillRect(horiz ? r() * w : colX + cw / 2 - rw / 2 + r() * rw, horiz ? rowY + cw / 2 - rw / 2 + r() * rw : r() * h, 1.5, 1.5); }
      g.strokeStyle = line; g.lineWidth = 4; g.setLineDash([36, 28]);
      g.beginPath(); g.moveTo(0, rowY + cw / 2); g.lineTo(w, rowY + cw / 2); g.stroke(); g.beginPath(); g.moveTo(colX + cw / 2, 0); g.lineTo(colX + cw / 2, h); g.stroke(); g.setLineDash([]);
      g.fillStyle = "rgba(255,255,255,.85)"; // zebra crossings at the junction
      for (let k = 0; k < 8; k++) { const o = -rw / 2 + 6 + k * (rw / 8); g.fillRect(colX + cw / 2 + sw / 2 + 6, rowY + cw / 2 + o, 22, rw / 16); g.fillRect(colX + cw / 2 - sw / 2 - 28, rowY + cw / 2 + o, 22, rw / 16); g.fillRect(colX + cw / 2 + o, rowY + cw / 2 + sw / 2 + 6, rw / 16, 22); g.fillRect(colX + cw / 2 + o, rowY + cw / 2 - sw / 2 - 28, rw / 16, 22); }
      const tx = target.x * cw, ty = target.y * cw;
      if (toy) { g.fillStyle = "#3b82f6"; g.beginPath(); g.arc(tx + cw / 2, ty + cw / 2, cw * 0.46, 0, 7); g.fill(); g.strokeStyle = "#dbeafe"; g.lineWidth = 7; g.setLineDash([22, 14]); g.stroke(); g.setLineDash([]); }
      else {
        g.fillStyle = real ? "#6f716d" : "#6f7a72"; g.fillRect(tx + 8, ty + 8, cw - 16, cw - 16);
        g.strokeStyle = "rgba(0,0,0,.3)"; g.lineWidth = 2;
        for (let i = 1; i < 6; i++) { const o = i * (cw - 16) / 6; g.beginPath(); g.moveTo(tx + 8 + o, ty + 8); g.lineTo(tx + 8 + o, ty + cw - 8); g.stroke(); g.beginPath(); g.moveTo(tx + 8, ty + 8 + o); g.lineTo(tx + cw - 8, ty + 8 + o); g.stroke(); }
        g.strokeStyle = "rgba(230,194,74,.8)"; g.lineWidth = 5; g.strokeRect(tx + 16, ty + 16, cw - 32, cw - 32);
      }
    } else {
      g.strokeStyle = "#9ca3af"; g.lineWidth = 2; g.fillStyle = "#6b7280"; g.font = "bold 18px monospace";
      for (let x = 0; x <= COLS; x++) { g.beginPath(); g.moveTo(x * cw, 0); g.lineTo(x * cw, h); g.stroke(); }
      for (let y = 0; y <= ROWS; y++) { g.beginPath(); g.moveTo(0, y * cw); g.lineTo(w, y * cw); g.stroke(); }
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) g.fillText(`${x},${y}`, x * cw + 8, y * cw + 24);
    }
    if (skin === "sandbox") { g.strokeStyle = "rgba(74,222,128,.25)"; g.lineWidth = 2; for (let x = 0; x <= COLS; x++) { g.beginPath(); g.moveTo(x * cw, 0); g.lineTo(x * cw, h); g.stroke(); } for (let y = 0; y <= ROWS; y++) { g.beginPath(); g.moveTo(0, y * cw); g.lineTo(w, y * cw); g.stroke(); } }
    g.fillStyle = neu ? "#d1d5db" : toy ? "#fbbf24" : "#50565e"; g.beginPath(); g.arc(cw / 2, cw / 2, cw * 0.38, 0, 7); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 6; g.stroke(); g.fillStyle = neu ? "#111" : "#fff"; g.font = `bold ${cw * 0.42}px system-ui`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(neu ? "B" : "H", cw / 2, cw / 2 + 3);
  });
}

function makeCar(color: number, lights: boolean) {
  const car = new THREE.Group();
  const body = new THREE.Mesh(roundedBox(2.4, 0.62, 1.15, 0.2), paint(color));
  body.position.y = 0.55; car.add(body);
  const cab = new THREE.Mesh(roundedBox(1.25, 0.5, 1.0, 0.2), std(0x1a232e, 0.08, 0.7, { envMapIntensity: 1.5 }));
  cab.position.set(-0.1, 1.05, 0); car.add(cab);
  const roof = new THREE.Mesh(roundedBox(1.0, 0.07, 0.92, 0.04), paint(color)); roof.position.set(-0.1, 1.33, 0); car.add(roof);
  for (const [a, z] of [[0.78, 0.58], [-0.78, 0.58], [0.78, -0.58], [-0.78, -0.58]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.22, 20), std(0x0d0d0f, 0.8)); w.rotation.x = Math.PI / 2; w.position.set(a, 0.27, z); car.add(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.24, 14), std(0xcfd3da, 0.25, 0.95)); hub.rotation.x = Math.PI / 2; hub.position.set(a, 0.27, z); car.add(hub);
  }
  for (const z of [-0.38, 0.38]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.26), new THREE.MeshBasicMaterial({ color: lights ? 0xfff2c4 : 0xe8e8e0, toneMapped: false })); hl.position.set(1.2, 0.6, z); car.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.24), new THREE.MeshBasicMaterial({ color: lights ? 0xff2a2a : 0x7a1a1a, toneMapped: false })); tl.position.set(-1.2, 0.62, z); car.add(tl);
  }
  return car;
}

function makePerson(i: number, sand: boolean) {
  const pc = [0xe11d48, 0x2563eb, 0xf59e0b, 0x10b981, 0x9333ea, 0xe5e7eb, 0x1f2937], sk = [0xf1c9a5, 0xc68642, 0x8d5524, 0xe0ac69];
  const f = new THREE.Group();
  const cloth = sand ? new THREE.MeshBasicMaterial({ color: 0x4ade80, wireframe: true, transparent: true, opacity: 0.6 }) : std(pc[i % pc.length], 0.85);
  const pants = sand ? cloth : std([0x1f2937, 0x374151, 0x1e3a5f][i % 3], 0.85);
  const skin = sand ? cloth : std(sk[i % 4], 0.65);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 6, 12), cloth); torso.position.y = 0.78; f.add(torso);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 4, 8), pants); leg.position.set(sx * 0.09, 0.33, 0); f.add(leg);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.36, 4, 8), cloth); arm.position.set(sx * 0.25, 0.8, 0); arm.rotation.z = sx * 0.12; f.add(arm);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), skin); head.position.y = 1.2; f.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), sand ? cloth : std([0x2b1b12, 0x6b4423, 0x111111, 0xb08d57][i % 4], 0.9)); hair.position.y = 1.22; f.add(hair);
  return f;
}

function makeDrone(skin: SceneSkin) {
  const toy = skin === "toy", real = skin === "real", neu = skin === "neutral";
  const drone = new THREE.Group();
  const shellCol = toy ? 0xfafafa : neu ? 0x1d4ed8 : 0x2a3037;
  const shell = paint(shellCol, { roughness: toy ? 0.25 : 0.42 });
  const carbon = std(0x14171b, 0.5, 0.3), metal = std(0xb9bfc8, 0.25, 0.95);
  const hull = new THREE.Mesh(roundedBox(1.35, 0.34, 1.35, 0.15, 4), shell); drone.add(hull);
  if (toy) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), shell); dome.scale.y = 0.6; dome.position.y = 0.12; drone.add(dome);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 10, 0, Math.PI * 2, 0, 1.2), paint(0xff7a00)); cap.position.y = 0.4; drone.add(cap);
  } else {
    const top = new THREE.Mesh(roundedBox(0.95, 0.2, 0.95, 0.09), carbon); top.position.y = 0.24; drone.add(top);
    for (let k = -1; k <= 1; k++) { const vent = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.05), std(0x050607, 0.9)); vent.position.set(0, 0.351, k * 0.18); drone.add(vent); }
    const stripe = new THREE.Mesh(roundedBox(1.37, 0.05, 0.22, 0.02), std(real ? 0xff6a00 : 0xf8fafc, 0.4)); stripe.position.set(0, 0.0, 0); drone.add(stripe);
  }
  const battery = new THREE.Mesh(roundedBox(0.82, 0.22, 0.62, 0.07), carbon); battery.position.y = -0.27; drone.add(battery);

  const rotors: THREE.Group[] = [], discs: THREE.Mesh[] = [];
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, -0.07); bladeShape.lineTo(0.3, -0.075); bladeShape.quadraticCurveTo(0.62, -0.06, 0.68, 0.0); bladeShape.quadraticCurveTo(0.6, 0.07, 0.3, 0.085); bladeShape.lineTo(0, 0.07); bladeShape.closePath();
  const bladeGeo = new THREE.ShapeGeometry(bladeShape, 10);
  const propCols = [0xff4d6d, 0x4cc9f0, 0xffd60a, 0x80ed99];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, arm = new THREE.Group(); arm.rotation.y = -a; drone.add(arm);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.105, 1.55, 14), toy ? shell : carbon); tube.rotation.z = Math.PI / 2; tube.position.set(0.8, 0.02, 0); arm.add(tube);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.28, 24), metal); motor.position.set(1.55, 0.1, 0); arm.add(motor);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.1, 24), toy ? paint(propCols[i]) : std(0x20252b, 0.35, 0.8)); bell.position.set(1.55, 0.3, 0); arm.add(bell);
    const prop = new THREE.Group(); prop.position.set(1.55, 0.37, 0); arm.add(prop);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.07, 14), metal); prop.add(hub);
    const bm = std(toy ? propCols[i] : 0x1d2126, 0.45, 0.1, { side: THREE.DoubleSide });
    for (const flip of [0, Math.PI]) { const b = new THREE.Mesh(bladeGeo, bm); b.rotation.x = -Math.PI / 2; b.rotation.z = flip; b.rotation.y = 0; b.position.y = 0.035; prop.add(b); }
    rotors.push(prop);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.69, 36), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(1.55, 0.4, 0); disc.visible = false; arm.add(disc); discs.push(disc);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), carbon); leg.position.set(1.2, -0.28, 0); leg.rotation.z = 0.42; arm.add(leg);
  }
  for (const sx of [-1, 1]) { // skids
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 10), carbon); skid.rotation.x = Math.PI / 2; skid.position.set(sx * 0.86, -0.54, 0); drone.add(skid);
  }
  const cam = new THREE.Group(); cam.position.set(0, -0.3, 0.58); drone.add(cam); // gimbal camera
  cam.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), std(0x0b0d10, 0.3, 0.8)));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 18), std(0x05080d, 0.05, 0.95, { envMapIntensity: 2 })); lens.rotation.x = Math.PI / 2; lens.position.z = 0.15; cam.add(lens);
  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.015, 8, 20), metal); lensRing.position.z = 0.21; cam.add(lensRing);
  const nav = (c: number, x: number, z: number) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); l.position.set(x, 0.0, z); drone.add(l); };
  nav(0xff2020, -0.7, 0.6); nav(0x20ff70, 0.7, 0.6); nav(0xffffff, 0, -0.69);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); strobe.position.set(0, 0.36, -0.2); drone.add(strobe);
  for (const sx of [-1, 1]) { const an = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), carbon); an.position.set(sx * 0.35, 0.38, -0.62); an.rotation.x = -0.35; drone.add(an); }

  // tethered payload
  const winch = new THREE.Mesh(roundedBox(0.34, 0.12, 0.34, 0.04), metal); winch.position.y = -0.42; drone.add(winch);
  const tether = new THREE.Group(); drone.add(tether);
  const cable = std(0x222222, 0.8);
  for (const [cx, cz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
    const top = new THREE.Vector3(cx * 0.4, -0.42, cz * 0.4), bot = new THREE.Vector3(cx, -0.78, cz);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, top.distanceTo(bot), 6), cable);
    c.position.copy(top).add(bot).multiplyScalar(0.5); c.lookAt(bot); c.rotateX(Math.PI / 2); tether.add(c);
  }
  const payload = new THREE.Group();
  const crateMat = std(0xffffff, 0.75, 0, { map: toy ? boxTex("#f472b6", "#fde047", false) : boxTex(neu ? "#f59e0b" : "#b78a5c", neu ? "#d97706" : "#cfb084", !neu) });
  payload.add(new THREE.Mesh(roundedBox(1, 0.8, 1, 0.07, 3), crateMat));
  if (toy) { for (const s of [-1, 1]) { const loop = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 16), std(0xfde047, 0.5)); loop.position.set(s * 0.17, 0.5, 0); loop.rotation.y = Math.PI / 2; loop.rotation.x = s * 0.5; payload.add(loop); } }
  else { const strap = new THREE.Mesh(roundedBox(1.02, 0.1, 1.02, 0.02), std(real ? 0xea580c : 0xd97706, 0.6)); strap.position.y = 0.1; payload.add(strap); }
  payload.position.set(0, -1.18, 0); drone.add(payload);
  return { drone, rotors, discs, payload, tether, strobe };
}

export function createDroneScene(container: HTMLElement, skin: SceneSkin, s0: Snap, ev: SceneEvents): SceneHandle {
  const toy = skin === "toy", real = skin === "real", sand = skin === "sandbox", neu = skin === "neutral";
  const canvas = makeCanvas(container);
  const renderer = makeRenderer(canvas, toy ? 1.05 : real ? 1.15 : 1.0);
  const scene = new THREE.Scene();
  scene.background = toy ? gradientBackground([[0, "#4fa9ee"], [0.55, "#a9dcff"], [1, "#e9f6ff"]])
    : real ? gradientBackground([[0, "#0b1226"], [0.5, "#2a2f57"], [0.85, "#c0643a"], [1, "#f19a5a"]])
    : sand ? gradientBackground([[0, "#a7b9ae"], [1, "#dfe9e2"]]) : gradientBackground([[0, "#eef0f3"], [1, "#d9dce2"]]);
  if (!neu) scene.fog = new THREE.Fog(toy ? 0xcbe9ff : real ? 0x3a3552 : 0xcdd8d0, toy ? 90 : 70, toy ? 240 : 190);
  applyEnvironment(renderer, scene, toy ? 0.6 : real ? 0.28 : 0.5);
  const camera = new THREE.PerspectiveCamera(44, 16 / 10, 0.5, 500);

  const K = Math.PI;
  scene.add(new THREE.HemisphereLight(toy ? 0xcdeaff : real ? 0x5a6a96 : 0xdfe9e2, toy ? 0x6fcf5a : 0x1a1d18, (toy ? 0.7 : real ? 0.55 : 0.8) * K));
  const sun = new THREE.DirectionalLight(toy ? 0xfff1d0 : real ? 0xff9a55 : 0xffffff, (toy ? 1.7 : real ? 1.35 : 1.1) * K);
  sun.position.set(real ? -34 : 26, real ? 18 : 44, real ? 22 : 16); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 40, bottom: -40, near: 1, far: 140 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3; scene.add(sun);
  if (real) { const fill = new THREE.DirectionalLight(0x6f86c9, 0.55 * K); fill.position.set(30, 25, -20); scene.add(fill); }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(COLS * CS, ROWS * CS), std(0xffffff, 0.95, 0, { map: groundTexture(skin, s0.target) }));
  ground.rotation.x = -Math.PI / 2; ground.userData.noCast = true; scene.add(ground);
  const apronMap = noiseTex(512, 41, 10, 0.9, [24, 24]);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), std(toy ? 0x62c04f : real ? 0x39403a : neu ? 0xd1d5db : 0x4a6454, 1, 0, { map: apronMap }));
  apron.rotation.x = -Math.PI / 2; apron.position.y = -0.05; apron.userData.noCast = true; scene.add(apron);

  const isCloud = (x: number, y: number) => s0.clouds.some((c) => c.x === x && c.y === y);
  const palToy = ["#f9a8d4", "#fde68a", "#93c5fd", "#86efac", "#c4b5fd"], palReal = ["#9a8f84", "#7d7468", "#6f7b86", "#8a7f74"];
  const facadeCache: Record<string, THREE.CanvasTexture> = {}, glowCache: Record<string, THREE.CanvasTexture> = {};
  const roofCache: Record<string, THREE.CanvasTexture> = {};
  const blocked = (x: number, y: number) => isCloud(x, y) || (x === 0 && y === 0) || (x === s0.target.x && y === s0.target.y) || x === 4 || y === s0.target.y;
  let hi = 0;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const cand = (x * 7 + y * 13) % 5 < 2;
    if (!cand || blocked(x, y)) continue;
    const i = hi++, h = toy ? 3 + (i % 4) : 3.5 + (i % 4) * 1.6, grp = new THREE.Group(), base = neu ? "#9ca3af" : (toy ? palToy : palReal)[i % (toy ? 5 : 4)];
    const rows = Math.max(2, Math.round(h / 1.4)), fk = `${base}|${rows}|${skin}`;
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, h, 4), neu ? std(0x9ca3af, 0.85) : std(0xffffff, 0.85, 0, {
      map: (facadeCache[fk] ||= facadeTex(base, toy ? "#cfe9ff" : "#2c3a4c", real ? 0.5 : 0.1, i * 13 + rows, 3, rows)),
      emissive: real ? 0xffffff : 0x000000, emissiveIntensity: real ? 0.9 : 0, emissiveMap: real ? (glowCache[fk] ||= facadeGlowTex(0.5, i * 13 + rows, 3, rows)) : null,
    }));
    body.position.y = h / 2; grp.add(body);
    if (!neu) {
      if (toy) { // gabled roof + chimney
        const sh = new THREE.Shape(); sh.moveTo(-2.35, 0); sh.lineTo(2.35, 0); sh.lineTo(0, 1.8); sh.closePath();
        const rg = new THREE.ExtrudeGeometry(sh, { depth: 4.5, bevelEnabled: false }); rg.translate(0, 0, -2.25);
        const rc = [0xc2410c, 0x1d4ed8][i % 2], rk = String(rc); const roof = new THREE.Mesh(rg, std(0xffffff, 0.8, 0, { map: (roofCache[rk] ||= roofTex(i % 2 ? "#4b6fb8" : "#c4572f", i)) }));
        roof.position.y = h; roof.rotation.y = (i % 2) * Math.PI / 2; grp.add(roof);
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), std(0x8b5a3c, 0.9)); ch.position.set(1.0, h + 1.2, 0.6); grp.add(ch);
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.06), std(0x7c4a2d, 0.7)); door.position.set(0, 0.65, 2.03); grp.add(door);
      } else { // flat roof, parapet, rooftop plant
        const slab = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.2, 4.15), std(0x55585c, 0.9)); slab.position.y = h + 0.1; grp.add(slab);
        for (const [px, pz, sx, sz] of [[0, 2.05, 4.15, 0.12], [0, -2.05, 4.15, 0.12], [2.05, 0, 0.12, 4.15], [-2.05, 0, 0.12, 4.15]] as const) { const p = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.35, sz), std(0x4a4d51, 0.9)); p.position.set(px, h + 0.3, pz); grp.add(p); }
        const ac = new THREE.Mesh(roundedBox(1.1, 0.55, 0.8, 0.05), std(0xa6abb2, 0.5, 0.6)); ac.position.set(-0.8, h + 0.45, -0.7); grp.add(ac);
        const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 16), std(0x222428, 0.5, 0.5)); fan.position.set(-0.8, h + 0.75, -0.7); grp.add(fan);
        if (i % 3 === 0) { const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.1, 18), std(0x6b4a33, 0.85)); tank.position.set(0.9, h + 1.0, 0.8); grp.add(tank); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.66, 0.35, 18), std(0x4a3626, 0.85)); cone.position.set(0.9, h + 1.72, 0.8); grp.add(cone); }
        else { const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.8, 6), std(0x9aa0a8, 0.4, 0.8)); mast.position.set(1.0, h + 1.1, 0.9); grp.add(mast); const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false })); lamp.position.set(1.0, h + 2.0, 0.9); grp.add(lamp); }
      }
    }
    grp.position.set(wx(x), 0, wz(y)); scene.add(grp);
  }
  const tr = rng(99);
  for (let i = 0; i < 20 && !neu; i++) {
    const x = Math.floor(tr() * COLS), y = Math.floor(tr() * ROWS); if (blocked(x, y)) continue;
    const t = new THREE.Group(), hh = 1.5 + tr() * 0.9;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.22, hh, 10), std(0x5b3a1e, 0.95, 0, { bumpMap: noiseTex(64, i, 6, 1.6), bumpScale: 0.5 })); trunk.position.y = hh / 2; t.add(trunk);
    if (toy) { for (let k = 0; k < 4; k++) { const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + (k % 2) * 0.25, 2), std(k % 2 ? 0x2fb84e : 0x1f9d42, 0.85)); leaf.position.set((k % 2 ? 0.4 : -0.35) * (k > 1 ? 1 : 0.6), hh + 0.7 + (k > 1 ? 0.5 : 0), (k % 3 - 1) * 0.35); t.add(leaf); } }
    else { for (let k = 0; k < 3; k++) { const cone = new THREE.Mesh(new THREE.ConeGeometry(1.15 - k * 0.28, 1.5, 12), std(real ? 0x1a3524 : 0x2f5a3a, 0.9)); cone.position.y = hh + 0.5 + k * 0.8; t.add(cone); } }
    t.position.set(wx(x) + (tr() - 0.5) * 3.6, 0, wz(y) + (tr() - 0.5) * 3.6); scene.add(t);
  }

  // street furniture + traffic along the two roads
  const roadZ = wz(s0.target.y), roadX = wx(4);
  const cars: { m: THREE.Group; axis: "x" | "z"; v: number; fixed: number }[] = [];
  if (!neu) {
    const carCols = toy ? [0xff5a5f, 0xffd166, 0x4cc9f0, 0xa78bfa] : [0xb91c1c, 0x1e3a8a, 0xd1d5db, 0x111827];
    ([["x", 0.85, 4.2], ["x", -0.85, -3.4], ["z", 0.85, 3.6], ["z", -0.85, -4.4]] as const).forEach(([axis, lane, v], i) => {
      const m = makeCar(carCols[i % 4], real || sand); scene.add(m);
      const fixed = axis === "x" ? roadZ + lane : roadX + lane;
      cars.push({ m, axis, v, fixed }); m.position.set(axis === "x" ? -20 + i * 14 : fixed, 0, axis === "z" ? -12 + i * 9 : fixed);
      m.rotation.y = axis === "x" ? (v > 0 ? 0 : Math.PI) : (v > 0 ? -Math.PI / 2 : Math.PI / 2);
    });
  }
  if (real || sand) for (let k = 0; k < 7; k++) {
    const lx = -26 + k * 9, lp = new THREE.Group(), side = k % 2 ? 2.7 : -2.7;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 10), std(0x3b4048, 0.5, 0.7)); pole.position.y = 2.1; lp.add(pole);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), std(0x3b4048, 0.5, 0.7)); arm.rotation.z = Math.PI / 2; arm.position.set(-side * 0.18, 4.2, 0); lp.add(arm);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.28), new THREE.MeshBasicMaterial({ color: sand ? 0xbbf7d0 : 0xffd9a0, toneMapped: false })); lamp.position.set(-side * 0.7, 4.15, 0); lp.add(lamp);
    lp.position.set(lx, 0, roadZ + side); scene.add(lp);
  }

  const clouds = s0.clouds.map((c) => {
    const grp = new THREE.Group();
    if (neu) { const b = new THREE.Mesh(new THREE.BoxGeometry(CS - 0.6, 9, CS - 0.6), new THREE.MeshStandardMaterial({ color: 0xef4444, transparent: true, opacity: 0.25 })); b.position.y = 4.5; b.userData.noCast = true; grp.add(b); }
    else {
      const cm = toy ? std(0xffffff, 1, 0, { emissive: 0x9fb7d6, emissiveIntensity: 0.28 }) : real ? std(0x353b49, 1, 0, { emissive: 0x161a24, emissiveIntensity: 0.5 }) : std(0x8a948f, 1);
      const puff = [[-1.5, 0.0, 0, 1.3], [-0.5, 0.45, 0.2, 1.6], [0.7, 0.3, -0.2, 1.5], [1.7, -0.05, 0.1, 1.15], [0.1, 0.9, 0.0, 1.2], [-0.9, 0.7, -0.4, 0.95], [1.1, 0.8, 0.3, 0.95]];
      for (const [px, py, pz, pr] of puff) { const sp = new THREE.Mesh(new THREE.IcosahedronGeometry(pr, 3), cm); sp.position.set(px, 7 + py, pz); sp.scale.y = 0.82; grp.add(sp); }
      if (!toy) { const c2 = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 9, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.12, side: THREE.DoubleSide })); c2.position.y = 4.5; c2.userData.noCast = true; grp.add(c2); }
    }
    grp.position.set(wx(c.x), 0, wz(c.y)); scene.add(grp); return grp;
  });

  // ---- target zone ----
  const T = new THREE.Group(); T.position.set(wx(s0.target.x), 0, wz(s0.target.y)); scene.add(T);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.5, 56), new THREE.MeshBasicMaterial({ color: real ? 0xef4444 : sand ? 0x4ade80 : 0xff2d2d, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.userData.noCast = true; T.add(ring);
  const balloons: { b: THREE.Mesh; p: number }[] = []; const people: { f: THREE.Group; home: THREE.Vector3; vx: number; vz: number; ph: number }[] = []; let redLight: THREE.PointLight | null = null; let arrow: THREE.Mesh | null = null;
  if (toy) {
    const bcol = [0xff4d6d, 0xffd60a, 0x4cc9f0, 0x80ed99, 0xc77dff, 0xff9e00];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28, bx = Math.cos(a) * 2.9, bz = Math.sin(a) * 2.9;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 18), paint(bcol[i], { roughness: 0.18, clearcoat: 1 })); b.scale.y = 1.2; b.position.set(bx, 3.2, bz); T.add(b);
      const knot = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 8), std(bcol[i], 0.4)); knot.rotation.x = Math.PI; knot.position.set(bx, 2.3, bz); T.add(knot);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.2, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); st.position.set(bx, 1.2, bz); T.add(st); balloons.push({ b, p: i });
    }
    const slide = new THREE.Group();
    const plat = new THREE.Mesh(roundedBox(1.3, 1.7, 1.3, 0.1), paint(0xfacc15)); plat.position.y = 0.85; slide.add(plat);
    const ramp = new THREE.Mesh(roundedBox(0.95, 0.12, 2.8, 0.05), paint(0xef4444)); ramp.position.set(0, 0.8, 1.9); ramp.rotation.x = 0.55; slide.add(ramp);
    for (const sx of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 2.8), paint(0xf8fafc)); rail.position.set(sx * 0.5, 0.95, 1.9); rail.rotation.x = 0.55; slide.add(rail); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), std(0xf8fafc, 0.4)); post.position.set(sx * 0.55, 2.2, -0.5); slide.add(post); }
    slide.position.set(-3.2, 0, -2.2); slide.rotation.y = 0.5; T.add(slide);
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.6, 12), std(0xffffff, 0.8, 0, { map: canvasTex(64, 64, (c, w, h) => { for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? "#ffffff" : "#ef4444"; c.fillRect((k * w) / 8, 0, w / 8, h); } }, { repeat: [1, 1] }) })); tent.position.set(3.3, 1.3, -2.4); T.add(tent);
    const tentBase = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.6, 12, 1, true), std(0xfafafa, 0.8, 0, { side: THREE.DoubleSide })); tentBase.position.set(3.3, 0.3, -2.4); T.add(tentBase);
    arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 20), new THREE.MeshBasicMaterial({ color: 0xff2d2d })); arrow.rotation.x = Math.PI; arrow.position.y = 4.8; arrow.userData.noCast = true; T.add(arrow);
  } else if (real || sand) {
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.28; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 8), std(real ? 0xf5f5f5 : 0x4ade80, 0.5, 0.2)); p.position.set(Math.cos(a) * 2.9, 0.55, Math.sin(a) * 2.9); T.add(p); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 12), std(0xf97316, 0.6)); cone.position.set(Math.cos(a + 0.26) * 2.9, 0.28, Math.sin(a + 0.26) * 2.9); if (i % 2 === 0) T.add(cone); }
    const tape = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.035, 6, 72), new THREE.MeshBasicMaterial({ color: real ? 0xff2d2d : 0x4ade80 })); tape.rotation.x = Math.PI / 2; tape.position.y = 0.95; T.add(tape);
    ([[-3.6, 2.4, 0.3, 0xb91c1c], [3.9, -2.2, 2.9, 0x1e3a8a]] as const).forEach(([cx, cz, rot, col]) => { const car = makeCar(col, real); car.position.set(cx, 0, cz); car.rotation.y = rot; T.add(car); });
    const pr = rng(11);
    for (let i = 0; i < s0.people; i++) {
      const a = pr() * 6.28, rr = Math.sqrt(pr()) * 0.36, f = makePerson(i, sand);
      f.scale.setScalar(1.7); f.position.set(Math.cos(a) * rr * CS, 0, Math.sin(a) * rr * CS); T.add(f);
      people.push({ f, home: f.position.clone(), vx: 0, vz: 0, ph: i });
    }
    if (real) { redLight = new THREE.PointLight(0xff2020, 80, 24, 2); redLight.position.set(0, 2.5, 0); T.add(redLight); }
  } else {
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 12), std(0xef4444, 0.5)); pil.position.y = 1.1; T.add(pil);
  }

  // ---- drone ----
  const { drone, rotors, discs, payload, tether, strobe } = makeDrone(skin);
  drone.scale.setScalar(2.0); drone.position.set(wx(0), 0.62, wz(0)); scene.add(drone);

  const trailGeo = new THREE.BufferGeometry(), trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: neu ? 0x1d4ed8 : 0x7dd3fc, transparent: true, opacity: 0.8 }));
  trailLine.visible = !toy; trailLine.userData.noCast = true; scene.add(trailLine);
  scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.noCast) { const mt = (o as THREE.Mesh).material as THREE.Material; if (!(mt as any).transparent && !(mt as THREE.MeshBasicMaterial).isMeshBasicMaterial) o.castShadow = true; o.receiveShadow = true; } });

  const fx: any = { confetti: null, shock: null, shake: 0, landed: false, dropped: false, vy: 0, trailN: -1, zoom: 0, pathIdx: 0, lastN: 0, visPos: new THREE.Vector3(wx(0), 0, wz(0)) };

  const resize = fitToContainer(container, renderer, camera);
  resize();

  function burst(t: number, snap: Snap) {
    const n = 260, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), v = new Float32Array(n * 3), pal = [[1, 0.3, 0.4], [1, 0.85, 0.1], [0.3, 0.8, 0.95], [0.5, 0.93, 0.6], [0.8, 0.5, 1]];
    for (let i = 0; i < n; i++) { pos[i * 3] = wx(snap.target.x); pos[i * 3 + 1] = 1; pos[i * 3 + 2] = wz(snap.target.y); const a = Math.random() * 6.28, s = 2 + Math.random() * 7; v[i * 3] = Math.cos(a) * s; v[i * 3 + 1] = 8 + Math.random() * 10; v[i * 3 + 2] = Math.sin(a) * s; col.set(pal[i % 5], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.38, vertexColors: true })); scene.add(pts); fx.confetti = { pts, geo, n, v, t0: t };
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
    const tx = fx.visPos.x, tz = fx.visPos.z, ty = up ? 9 : 0.62;
    const px = drone.position.x, pz = drone.position.z;
    drone.position.x += (tx - px) * Math.min(1, k * 2.5); drone.position.z += (tz - pz) * Math.min(1, k * 2.5);
    drone.position.y += (ty + (up ? Math.sin(t * 2.2) * 0.18 : 0) - drone.position.y) * k;
    drone.rotation.z += ((-(tx - px) * 1.2) - drone.rotation.z) * 0.15; drone.rotation.x += (((tz - pz) * 1.2) - drone.rotation.x) * 0.15;
    rotors.forEach((r, i) => { r.rotation.y += dt * (up ? 70 : 1.5) * (i % 2 ? 1 : -1); });
    discs.forEach((d) => { d.visible = up; });
    tether.visible = !fx.dropped;
    (strobe.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(t * 9) > 0.85 ? 0xffffff : 0x222222);
    clouds.forEach((c, i) => { c.position.y = Math.sin(t * 0.6 + i) * 0.25; c.rotation.y = Math.sin(t * 0.1 + i) * 0.2; });
    cars.forEach((c) => {
      const lim = c.axis === "x" ? COLS * CS / 2 + 4 : ROWS * CS / 2 + 4, key = c.axis;
      c.m.position[key] += c.v * dt; if (c.m.position[key] > lim) c.m.position[key] = -lim; if (c.m.position[key] < -lim) c.m.position[key] = lim;
    });
    balloons.forEach((b) => { b.b.position.y = 3.2 + Math.sin(t * 1.4 + b.p) * 0.25; });
    if (arrow) arrow.position.y = 4.8 + Math.sin(t * 3) * 0.35;
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(t * 4);
    if (redLight) redLight.intensity = 50 + 50 * Math.max(0, Math.sin(t * 6));
    const scattering = fx.shock?.scatter && t - fx.shock.t0 < 2.2;
    people.forEach((p) => { if (scattering) { p.f.position.x += p.vx * dt; p.f.position.z += p.vz * dt; } p.f.position.y = Math.abs(Math.sin(t * 2 + p.ph)) * (scattering ? 0.25 : 0.02); });
    if (snap.trail.length !== fx.trailN) { fx.trailN = snap.trail.length; trailGeo.setFromPoints(snap.trail.map((c) => new THREE.Vector3(wx(c.x), 9, wz(c.y)))); }

    // --- payload: drops only once the drone has visually arrived ---
    // The model's decisions are instant but the flight is not: drop when the drone is over the spot where it released, not at the end of its queued path.
    const rel = snap.releasedAt, overRelease = arrived || (rel ? Math.hypot(drone.position.x - wx(rel.x), drone.position.z - wz(rel.y)) < 2.0 : false);   // the drone trails its own path by ~1.2 units, so allow a little slack; reaching the end of the path is the safety net
    if (snap.released && !fx.dropped && overRelease) { fx.dropped = true; const wp = new THREE.Vector3(); payload.getWorldPosition(wp); scene.attach(payload); payload.position.copy(wp); payload.scale.setScalar(2.0); fx.vy = 0; }
    if (fx.dropped && !fx.landed) {
      fx.vy -= 24 * dt; payload.position.y += fx.vy * dt; payload.rotation.y += dt * 2;
      if (payload.position.y <= 0.8) {
        payload.position.y = 0.8; fx.landed = true;
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
    const z = fx.zoom, fxp = new THREE.Vector3(drone.position.x * 0.85 * z, -1 * (1 - z) + 3 * z, 0.5 * (1 - z) + drone.position.z * 0.85 * z);
    camera.position.set(fxp.x + Math.sin(t * 0.15) * 1.2 + (Math.random() - 0.5) * fx.shake, 43 - 20 * z + (Math.random() - 0.5) * fx.shake, fxp.z + 36 - 15 * z);
    camera.lookAt(fxp);
    renderer.render(scene, camera);
  }

  return {
    frame, resize,
    snapshotJpeg: () => canvas.toDataURL("image/jpeg", 0.6),
    dispose() { disposeRenderer(renderer, canvas); },
  };
}
