// Shared "realism kit" for the 3D scenes: image-based lighting, procedural PBR textures and smooth geometry helpers.
// View-only code: nothing here knows about game rules.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export const rng = (seed: number) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

export const std = (color: number, rough = 0.6, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
export const paint = (color: number, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.12, clearcoat: 0.8, clearcoatRoughness: 0.18, ...extra });
export function glassMat(color: number, opacity: number) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.04, metalness: 0, transparent: true, opacity, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
}

/** The full-size canvas every scene draws into (prepended so overlays stay on top). */
export function makeCanvas(container: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  container.prepend(canvas);
  return canvas;
}

/** Returns a resize() that fits the renderer and camera to the container. Call it once after creating it. */
export function fitToContainer(container: HTMLElement, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
  return function resize() {
    const r = container.getBoundingClientRect();
    if (!r.width) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  };
}

export function disposeRenderer(renderer: THREE.WebGLRenderer, canvas: HTMLCanvasElement) {
  renderer.dispose();
  renderer.forceContextLoss();
  canvas.remove();
}

export function canvasTex(w: number, h: number, fn: (g: CanvasRenderingContext2D, w: number, h: number) => void, o: { repeat?: [number, number]; srgb?: boolean } = {}): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  fn(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
  return t;
}

/** Renderer with the settings every scene shares (filmic tone mapping, soft shadows, sRGB output). */
export function makeRenderer(canvas: HTMLCanvasElement, exposure = 1): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap; // soft-filtered in this three version (PCFSoftShadowMap was removed)
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = exposure;
  return r;
}

/** Image-based lighting: gives metals, glass and glossy paint something to reflect. */
export function applyEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, intensity: number) {
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new RoomEnvironment();
  scene.environment = pm.fromScene(env, 0.04).texture;
  scene.environmentIntensity = intensity;
  env.dispose();
  pm.dispose();
}

/** Vertical gradient used as a sky / backdrop. stops: [0..1 from top, css colour]. */
export function gradientBackground(stops: [number, string][]): THREE.CanvasTexture {
  return canvasTex(8, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    for (const [p, c] of stops) gr.addColorStop(p, c);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

export function roundedBox(w: number, h: number, d: number, r = 0.12, seg = 3) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
}

export function lathe(profile: [number, number][], seg = 40) {
  return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}

/** A smooth link between two joint circles (radius r0 at the origin, r1 at (0,len)), extruded `depth` along X. */
export function linkGeometry(len: number, r0: number, r1: number, depth: number, bevel = 0.08) {
  const a = Math.asin((r0 - r1) / len), s = new THREE.Shape();
  s.moveTo(r0 * Math.cos(a), r0 * Math.sin(a));
  s.lineTo(r1 * Math.cos(a), len + r1 * Math.sin(a));
  s.absarc(0, len, r1, a, Math.PI - a, false);
  s.lineTo(-r0 * Math.cos(a), r0 * Math.sin(a));
  s.absarc(0, 0, r0, Math.PI - a, Math.PI * 2 + a, false);
  const g = new THREE.ExtrudeGeometry(s, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 28 });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  g.rotateY(Math.PI / 2); // extrusion axis Z -> X, so the link bends about the X axis
  return g;
}

/** Soft mottled noise, 0..1 greyscale, useful for bump / roughness maps. */
export function noiseTex(size: number, seed: number, scale = 1, contrast = 1, repeat: [number, number] = [1, 1]) {
  return canvasTex(size, size, (g, w, h) => {
    const r = rng(seed), img = g.createImageData(w, h);
    const cells = 16 * scale, grid = Array.from({ length: (cells + 1) * (cells + 1) }, () => r());
    const at = (x: number, y: number) => grid[(y % cells) * (cells + 1) + (x % cells)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fx = (x / w) * cells, fy = (y / h) * cells, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const v = at(x0, y0) * (1 - sx) * (1 - sy) + at(x0 + 1, y0) * sx * (1 - sy) + at(x0, y0 + 1) * (1 - sx) * sy + at(x0 + 1, y0 + 1) * sx * sy;
      const c = Math.max(0, Math.min(255, (0.5 + (v - 0.5) * contrast) * 255 + (r() - 0.5) * 18));
      const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false, repeat });
}

/** Wood grain (planks) as colour map. */
export function woodTex(base: string, dark: string, seed = 3, repeat: [number, number] = [1, 1]) {
  return canvasTex(512, 512, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = dark; g.globalAlpha = 0.05 + r() * 0.12; g.lineWidth = 0.6 + r() * 2.2;
      const y = r() * h, amp = 2 + r() * 6, ph = r() * 6, fr = 0.006 + r() * 0.01;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x * fr + ph) * amp; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
      g.stroke();
    }
    g.globalAlpha = 1;
  }, { repeat });
}

/** Window facade: used on both toy and city buildings. */
export function facadeTex(base: string, glass: string, lit: number, seed: number, cols = 4, rows = 4, px = 64) {
  return canvasTex(cols * px, rows * px, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4); }
    const cw = w / cols, ch = h / rows;
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const x = cx * cw + cw * 0.18, y = cy * ch + ch * 0.2, ww = cw * 0.64, hh = ch * 0.6, on = r() < lit;
      g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(x - 3, y - 3, ww + 6, hh + 6);
      const gr = g.createLinearGradient(x, y, x, y + hh);
      if (on) { gr.addColorStop(0, "#ffe2a1"); gr.addColorStop(1, "#ffb454"); } else { gr.addColorStop(0, glass); gr.addColorStop(1, "#0b1220"); }
      g.fillStyle = gr; g.fillRect(x, y, ww, hh);
      g.fillStyle = "rgba(255,255,255,.18)"; g.beginPath(); g.moveTo(x, y); g.lineTo(x + ww * 0.5, y); g.lineTo(x, y + hh * 0.55); g.fill();
      g.strokeStyle = "rgba(20,20,24,.9)"; g.lineWidth = 2; g.strokeRect(x, y, ww, hh); g.beginPath(); g.moveTo(x + ww / 2, y); g.lineTo(x + ww / 2, y + hh); g.stroke();
      g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(x - 4, y + hh + 3, ww + 8, 3);
    }
  });
}

/** Cardboard / paper with tape; used for the delivery crate and the gift box. */
export function boxTex(base: string, tape: string, label: boolean) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rng(17);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.06})`; g.fillRect(r() * w, r() * h, 1 + r() * 18, 1); }
    g.fillStyle = tape; g.fillRect(w / 2 - 18, 0, 36, h); g.fillRect(0, h / 2 - 18, w, 36);
    g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(w / 2 - 18, 0, 8, h); g.fillRect(0, h / 2 - 18, w, 8);
    if (label) {
      g.fillStyle = "#f8fafc"; g.fillRect(24, 24, 100, 70); g.fillStyle = "#111"; g.font = "bold 13px monospace";
      g.fillText("20 KG", 32, 46); g.fillText("FRAGILE", 32, 64); g.fillRect(32, 72, 84, 12);
      for (let i = 0; i < 20; i++) { g.fillStyle = "#fff"; g.fillRect(32 + i * 4 + (i % 3), 72, 1.2, 12); }
    }
  });
}

/** Emissive twin of facadeTex: black everywhere except the windows facadeTex draws as lit (same seed => same windows). */
export function facadeGlowTex(lit: number, seed: number, cols = 4, rows = 4, px = 64) {
  return canvasTex(cols * px, rows * px, (g, w, h) => {
    const r = rng(seed);
    for (let i = 0; i < 1400 * 5; i++) r();
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const x = cx * cw + cw * 0.18, y = cy * ch + ch * 0.2, ww = cw * 0.64, hh = ch * 0.6;
      if (r() < lit) { g.fillStyle = "#ffcf7a"; g.fillRect(x, y, ww, hh); }
    }
  });
}

/** Overlapping tile / shingle roof colour map. */
export function roofTex(base: string, seed = 5) {
  return canvasTex(128, 128, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < w; x += 32) {
      g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.14})`; g.fillRect(x + 1, y + 1, 30, 14);
      g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x + 1, y + 1, 30, 3);
    }
  }, { repeat: [3, 2] });
}
