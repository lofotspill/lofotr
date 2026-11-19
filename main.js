// Lofotr – hovudløkka: renderer, styring, kollisjon, HUD.
import * as THREE from 'three';
import { heightAt, shoreX } from './world.js';
import { BOUNDS, QUAY_Y, SPAWN, onQuay } from './layout.js';
import { buildTerrain, buildWater } from './terrain.js';
import { createSky } from './sky.js';
import { buildVillage } from './village.js';
import { createAudio } from './audio.js';
import { CONTENT } from './content.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 40000);
camera.rotation.order = 'YXZ';

const terrain = buildTerrain(scene);
const water = buildWater(scene);
const sky = createSky(scene, renderer, water);
const village = buildVillage(scene);
const audio = createAudio();
sky.snap(params.get('t') === 'kveld' ? 'kveld' : 'dag');

// ---------- spelar ----------
const P = { x: SPAWN.x, z: SPAWN.z, y: 0, yaw: SPAWN.yaw, pitch: -0.04, bob: 0, stepAcc: 0, vy: 0 };
const RADIUS = 0.42, EYE = 1.7;
const keys = {};
let locked = false, started = false, cardOpen = false, current = null;

function groundY(x, z) {
  if (onQuay(x, z, village.quayRects)) return QUAY_Y;
  return Math.max(heightAt(x, z), 0.3);
}
function blocked(x, z) {
  const q = onQuay(x, z, village.quayRects);
  if (!q) {
    if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) return true;
    if (x > shoreX(z) + 0.2) return true;
  }
  return false;
}
function pushOut(x, z) {
  for (const c of village.colliders) {
    if (c.t === 'circle') {
      const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + RADIUS;
      if (d < m) { const k = d > 1e-4 ? m / d : 1; x = c.x + (dx || 1e-3) * k; z = c.z + dz * k; }
    } else {
      const ca = Math.cos(c.a), sa = Math.sin(c.a);
      const dx = x - c.x, dz = z - c.z;
      const lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
      const hx = c.hx + RADIUS, hz = c.hz + RADIUS;
      if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
        const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
        let nx = lx, nz = lz;
        if (px < pz) nx = Math.sign(lx || 1) * hx; else nz = Math.sign(lz || 1) * hz;
        x = c.x + nx * ca + nz * sa; z = c.z - nx * sa + nz * ca;
      }
    }
  }
  return [x, z];
}
function tryMove(dx, dz) {
  for (const [mx, mz] of [[dx, dz], [dx, 0], [0, dz]]) {
    if (!mx && !mz) continue;
    let nx = P.x + mx, nz = P.z + mz;
    [nx, nz] = pushOut(nx, nz);
    if (blocked(nx, nz)) continue;
    const dh = groundY(nx, nz) - groundY(P.x, P.z);
    if (dh > 0.6 * Math.hypot(nx - P.x, nz - P.z) + 0.05 && groundY(nx, nz) > 3) continue; // for bratt
    P.x = nx; P.z = nz;
    return true;
  }
  return false;
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyT') toast(sky.next());
  if (e.code === 'KeyM') toast(audio.toggle() ? 'Lyd av' : 'Lyd på');
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousemove', (e) => {
  if (!locked) return;
  P.yaw += e.movementX * 0.0022;
  P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch - e.movementY * 0.0022));
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (!locked && started && !params.has('auto')) {
    $('start').style.display = 'flex'; $('go').textContent = 'Fortset';
  }
});
function begin() {
  started = true;
  audio.start();
  $('start').style.display = 'none';
  if (!params.has('auto')) renderer.domElement.requestPointerLock();
}
$('start').addEventListener('click', () => { if (ready) begin(); });
renderer.domElement.addEventListener('click', () => { if (started && !locked && !params.has('auto')) renderer.domElement.requestPointerLock(); });

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 1800);
}
function interact() {
  if (cardOpen) { $('card').classList.remove('on'); cardOpen = false; return; }
  if (!current) return;
  const c = CONTENT[current.key]; if (!c) return;
  $('ctitle').textContent = c.title;
  $('cbody').innerHTML = c.lines.map((l) => `<p>${l}</p>`).join('');
  $('card').classList.add('on'); cardOpen = true;
}

// ---------- måsar ----------
const gulls = [];
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.15, 1.1, 0, -0.05, 0, 0, -0.2, 0, 0, 0.15, 0, 0, -0.2, -1.1, 0, -0.05, 0, 0.02, 0.35, 0.05, 0, 0.1, -0.05, 0, 0.1], 3));
  g.computeVertexNormals();
  const m = new THREE.MeshBasicMaterial({ color: '#f1f1ee', side: THREE.DoubleSide, fog: true });
  for (let i = 0; i < 9; i++) {
    const o = new THREE.Mesh(g, m);
    o.userData = { r: 20 + Math.random() * 60, cx: 40 + Math.random() * 40, cz: -10 + Math.random() * 40, h: 14 + Math.random() * 22, sp: 0.15 + Math.random() * 0.15, ph: Math.random() * 6.28 };
    o.scale.setScalar(0.9);
    scene.add(o); gulls.push(o);
  }
}
function updateGulls(t) {
  for (const o of gulls) {
    const u = o.userData, a = t * u.sp + u.ph;
    const x = u.cx + Math.cos(a) * u.r, z = u.cz + Math.sin(a) * u.r;
    o.position.set(x, u.h + Math.sin(t * 0.4 + u.ph) * 2, z);
    o.rotation.set(0, -a, Math.sin(t * 1.5 + u.ph) * 0.35);
    o.scale.set(0.9, 0.9 + Math.sin(t * 7 + u.ph) * 0.3, 0.9);
  }
}

// ---------- løkke ----------
const clock = new THREE.Clock();
let time = 0, ready = false;
const focus = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  if (started && !cardOpen) {
    let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    let s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const run = keys.ShiftLeft || keys.ShiftRight;
    const sp = (run ? 5.4 : 2.9) * dt;
    const l = Math.hypot(f, s);
    if (l > 0) {
      f /= l; s /= l;
      const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
      const dx = (sy * f + cy * s) * sp, dz = (-cy * f + sy * s) * sp;
      if (tryMove(dx, dz)) {
        P.bob += sp * 2.1; P.stepAcc += sp;
        if (P.stepAcc > (run ? 2.0 : 1.5)) { P.stepAcc = 0; audio.step(onQuay(P.x, P.z, village.quayRects) ? 'planke' : 'grus'); }
      }
    }
  }
  const gy = groundY(P.x, P.z);
  P.y += (gy - P.y) * Math.min(1, dt * 12) || 0;
  if (!isFinite(P.y)) P.y = gy;
  const bob = Math.sin(P.bob) * 0.035;
  camera.position.set(P.x, P.y + EYE + bob, P.z);
  camera.rotation.set(P.pitch, -P.yaw, 0);
  focus.set(P.x, P.y, P.z);
  sky.update(dt, time, focus);
  village.update(time, sky.windowGlow);
  updateGulls(time);
  // interaksjon
  current = null;
  let best = 1e9;
  for (const it of village.interactables) {
    const d = Math.hypot(P.x - it.x, P.z - it.z);
    if (d < it.r && d < best) { best = d; current = it; }
  }
  const pr = $('prompt');
  if (current && !cardOpen && started) { $('plabel').textContent = current.label; pr.classList.add('on'); } else pr.classList.remove('on');
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
});

// feilsøking og skjermbilde
window.__lofotr = {
  THREE, scene, camera, renderer, sky, village, P, tryMove, groundY,
  view(x, z, yaw, pitch = -0.05, mode) {
    P.x = x; P.z = z; P.yaw = yaw; P.pitch = pitch; P.y = groundY(x, z);
    if (mode) sky.snap(mode);
  },
  frames: 0,
};
for (const k of ['x', 'z', 'yaw', 'pitch']) if (params.has(k)) P[k] = parseFloat(params.get(k));
P.y = groundY(P.x, P.z);
if (params.has('auto')) { started = true; $('start').style.display = 'none'; }

setTimeout(() => {
  ready = true;
  $('go').textContent = 'Gå inn i bygda';
  requestAnimationFrame(frame);
}, 50);
