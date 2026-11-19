// Bygda: hus, kai, hjeller, båter, sperringer og småting. Alt er laget av kode.
import * as THREE from 'three';
import { heightAt, shoreX, SEA } from './world.js';
import { BOUNDS, QUAY_Y, PATHS, pathDist, quayRects, onQuay } from './layout.js';
import { clapboard, vertBoards, roofTiles, corrugated, planks, weathered, grassTuft, sign, barrel, crate } from './textures.js';
import { makeBoat } from './boats.js';
import { mulberry32, createNoise } from './noise.js';

const R = mulberry32(777);
const rr = (a, b) => a + (b - a) * R();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- materialer ----------
const cache = {};
function metric(t) { const m = t.clone(); m.repeat.set(0.5, 0.5); m.needsUpdate = true; return m; }
function texMat(kind, hex, extra = {}) {
  const key = kind + hex;
  if (cache[key]) return cache[key];
  const fn = { clap: clapboard, vert: vertBoards, tile: roofTiles, corr: corrugated, plank: planks, weath: weathered }[kind];
  const t = fn(hex);
  const m = new THREE.MeshStandardMaterial({
    map: metric(t.map), roughness: 0.9, ...extra,
    ...(t.bump ? { bumpMap: metric(t.bump), bumpScale: kind === 'corr' ? 2 : 1.6 } : {}),
  });
  return (cache[key] = m);
}
function flat(hex, rough = 0.85, extra = {}) {
  const key = 'f' + hex + rough + JSON.stringify(extra);
  return cache[key] || (cache[key] = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, ...extra }));
}
function metricBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
  }
  return g;
}
function mesh(geo, mat, { cast = true, recv = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}
function groundAt(x, z) { return Math.max(heightAt(x, z), 0.5); }
function baseHeight(x, z, w, d, rot) {
  let h = -1e9;
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
    const lx = sx * w / 2, lz = sz * d / 2;
    const wx = x + lx * Math.cos(rot) + lz * Math.sin(rot), wz = z - lx * Math.sin(rot) + lz * Math.cos(rot);
    h = Math.max(h, heightAt(wx, wz));
  }
  return h;
}

export function buildVillage(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const colliders = [];     // {t:'obb',x,z,hx,hz,a} | {t:'circle',x,z,r}
  const interactables = []; // {id,key,x,z,r,label}
  const boats = [];
  const lamps = [];         // emissive-materialer som lyser om kvelden
  const winPanes = [];      // instanserte rutemeshes
  const winData = { frame: [], pane: [], mv: [], mh: [] };

  const obb = (x, z, hx, hz, a = 0) => colliders.push({ t: 'obb', x, z, hx, hz, a });
  const circ = (x, z, r) => colliders.push({ t: 'circle', x, z, r });

  // ---------- vindu ----------
  const M4 = new THREE.Matrix4(), T4 = new THREE.Matrix4(), S4 = new THREE.Matrix4();
  function addWindow(grp, lx, ly, lz, ry, sx = 1, sy = 1) {
    const B = new THREE.Matrix4().makeRotationY(ry).setPosition(lx, ly, lz).premultiply(grp.matrixWorld);
    const push = (arr, ox, oy, oz, w, h, d) => {
      M4.copy(B).multiply(T4.makeTranslation(ox * sx, oy * sy, oz)).multiply(S4.makeScale(w * sx, h * sy, d));
      arr.push(M4.clone());
    };
    push(winData.frame, 0, 0, 0.05, 1.05, 1.35, 0.12);
    push(winData.pane, 0, 0, 0.115, 0.84, 1.14, 0.03);
    push(winData.mv, 0, 0, 0.14, 0.05, 1.14, 0.04);
    push(winData.mh, 0, 0.1, 0.14, 0.84, 0.05, 0.04);
  }

  // ---------- hus ----------
  function house(o) {
    const {
      x, z, w = 7, d = 5.5, floors = 1, fh = 2.7, to, rot, wall = 'clap', color = '#a33a2b', trim = '#eee9dc',
      roof = 'tile', roofColor = '#4a4040', pitch = 0.62, doorColor = '#2f4a58', doorX = null, chimney = true,
      windows = true, sillRows = 1, name,
    } = o;
    const a = rot !== undefined ? rot : Math.atan2(to[0] - x, to[1] - z);
    const base = baseHeight(x, z, w, d, a) + 0.06;
    const g = new THREE.Group();
    g.position.set(x, base, z); g.rotation.y = a;
    root.add(g);
    g.updateMatrixWorld(true);
    const H = floors * fh;
    // sokkel
    const fnd = mesh(metricBox(w + 0.25, 1.9, d + 0.25), texMat('weath', '#7b7870'));
    fnd.position.y = 0.35 - 0.95;
    g.add(fnd);
    // vegger
    const wm = texMat(wall, color);
    const walls = mesh(metricBox(w, H, d), wm);
    walls.position.y = 0.3 + H / 2;
    g.add(walls);
    const top = 0.3 + H;
    // hjørnebord
    const tm = flat(trim, 0.8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const c = mesh(new THREE.BoxGeometry(0.16, H, 0.16), tm);
      c.position.set(sx * (w / 2 + 0.01), 0.3 + H / 2, sz * (d / 2 + 0.01)); g.add(c);
    }
    const band = mesh(new THREE.BoxGeometry(w + 0.12, 0.14, d + 0.12), tm);
    band.position.y = 0.34; g.add(band);
    // tak
    const oh = 0.45, ohx = 0.4;
    const L = (d / 2 + oh) / Math.cos(Math.atan(pitch));
    const th = Math.atan(pitch);
    const rm = roof === 'corr' ? texMat('corr', roofColor) : texMat('tile', roofColor);
    const edge = flat('#2b2623', 0.9);
    for (const s of [-1, 1]) {
      const geo = metricBox(w + ohx * 2, 0.09, L);
      const p = mesh(geo, [edge, edge, rm, edge, edge, edge]);
      p.position.set(0, top + (d / 4 - oh / 2) * pitch + 0.02, s * (d / 2 + oh) / 2);
      p.rotation.x = s * th;
      g.add(p);
    }
    const ridge = mesh(new THREE.BoxGeometry(w + ohx * 2 + 0.05, 0.1, 0.22), edge);
    ridge.position.y = top + (d / 2) * pitch + 0.05; g.add(ridge);
    // gavler
    const R2 = (d / 2) * pitch;
    const sh = new THREE.Shape(); sh.moveTo(-d / 2, 0); sh.lineTo(d / 2, 0); sh.lineTo(0, R2 + 0.02); sh.closePath();
    const gm = texMat(wall === 'vert' ? 'vert' : 'clap', color);
    for (const s of [-1, 1]) {
      const gb = mesh(new THREE.ShapeGeometry(sh), gm);
      gb.material = gm; gb.position.set(s * (w / 2 + 0.005), top, 0); gb.rotation.y = s * Math.PI / 2;
      g.add(gb);
    }
    if (chimney) {
      const ch = mesh(new THREE.BoxGeometry(0.7, 2.0, 0.7), texMat('weath', '#8a6a5a'));
      ch.position.set(w * 0.22, top + R2 * 0.7 + 0.5, d * 0.05); g.add(ch);
      const cap = mesh(new THREE.BoxGeometry(0.85, 0.1, 0.85), flat('#4a4543'));
      cap.position.set(w * 0.22, top + R2 * 0.7 + 1.55, d * 0.05); g.add(cap);
    }
    // dør
    const dx = doorX !== null ? doorX : (w > 8.5 ? -w * 0.2 : 0);
    const dframe = mesh(new THREE.BoxGeometry(1.25, 2.3, 0.14), tm);
    dframe.position.set(dx, 0.3 + 1.15, d / 2 + 0.05); g.add(dframe);
    const door = mesh(new THREE.BoxGeometry(0.98, 2.1, 0.1), flat(doorColor, 0.7));
    door.position.set(dx, 0.3 + 1.05, d / 2 + 0.1); g.add(door);
    const step = mesh(new THREE.BoxGeometry(1.8, 0.35, 0.9), texMat('weath', '#8a867c'));
    step.position.set(dx, 0.1, d / 2 + 0.45); g.add(step);
    // vinduer
    if (windows) {
      const nf = Math.max(1, Math.floor((w - 1.2) / 2.4));
      const ns = Math.max(1, Math.floor((d - 0.8) / 2.6));
      for (let f = 0; f < floors; f++) {
        const y = 0.3 + f * fh + fh * 0.58;
        for (let k = 0; k < nf; k++) {
          const lx = -w / 2 + (k + 0.5) * (w / nf);
          if (f === 0 && Math.abs(lx - dx) < 1.5) continue;
          addWindow(g, lx, y, d / 2, 0);
          addWindow(g, -lx, y, -d / 2, Math.PI);
        }
        for (let k = 0; k < ns; k++) {
          const lz = -d / 2 + (k + 0.5) * (d / ns);
          addWindow(g, w / 2, y, lz, Math.PI / 2);
          addWindow(g, -w / 2, y, lz, -Math.PI / 2);
        }
      }
    }
    obb(x, z, w / 2 + 0.45, d / 2 + 0.45, a);
    g.userData = { name, a, w, d, base, dx, top, wallH: H };
    return g;
  }
  // skilt montert på vegg: lokalt i hus-gruppa (front = +z)
  function wallSign(grp, tex, lx, ly, w, h, face = 'front') {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    m.castShadow = false; m.receiveShadow = true;
    const { d } = grp.userData;
    m.position.set(lx, ly, d / 2 + 0.07);
    grp.add(m);
    return m;
  }

  // ---------- kai ----------
  const rects = quayRects();
  {
    const topM = texMat('plank', '#7b6a55'), sideM = texMat('weath', '#6d6a63');
    const mats = [sideM, sideM, topM, sideM, sideM, sideM];
    const post = new THREE.CylinderGeometry(0.16, 0.2, 3.6, 8);
    const posts = [];
    for (const r of rects) {
      const w = r.hx * 2, d = r.hz * 2, depth = 3.2;
      const m = mesh(metricBox(w, depth, d), mats);
      m.position.set(r.cx, QUAY_Y - depth / 2, r.cz);
      root.add(m);
    }
    // pæler og pullerter langs ytterkanten
    const bol = new THREE.CylinderGeometry(0.18, 0.26, 0.45, 10);
    const bolM = flat('#2b2b2b', 0.6);
    const post2 = new THREE.InstancedMesh(post, flat('#3a2e24', 0.95), 600);
    let np = 0; const q = new THREE.Matrix4();
    for (const r of rects) {
      const edgeX = r.cx + r.hx;
      if (r.hz === 2 && r.hx > 5) { // brygge: pæler på begge sider
        for (let k = 0; k <= 5; k++) for (const s of [-1, 1]) { q.makeTranslation(r.cx - r.hx + k * (r.hx * 2) / 5, QUAY_Y - 1.2, r.cz + s * (r.hz - 0.15)); post2.setMatrixAt(np++, q); }
        continue;
      }
      for (const dz of [-1.2, 1.2]) { q.makeTranslation(edgeX - 0.15, QUAY_Y - 1.1, r.cz + dz); post2.setMatrixAt(np++, q); }
      const b = mesh(bol, bolM); b.position.set(edgeX - 0.6, QUAY_Y + 0.22, r.cz + 0.1); root.add(b);
    }
    post2.count = np; post2.castShadow = true; root.add(post2);
    // pullerter på bryggen
    for (const r of rects) if (r.hx > 5) for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
      const b = mesh(bol, bolM); b.position.set(r.cx - r.hx + 2 + k * 5.2, QUAY_Y + 0.22, r.cz + s * 1.6); root.add(b);
    }
  }

  // ---------- bygg ----------
  const sx = shoreX;
  const H = {};
  // kjøpmann: gul kolonialhandel
  H.kolonial = house({ x: -10, z: 0.5, w: 11, d: 8, floors: 2, fh: 2.8, to: [-10, 12], wall: 'clap', color: '#d4aa3a', roofColor: '#403a3a', doorColor: '#7a2a22', name: 'kolonial', pitch: 0.55 });
  wallSign(H.kolonial, sign([{ text: 'KOLONIALHANDEL', size: 78 }], { w: 768, h: 128, bg: '#d4aa3a', fg: '#7a1f1a' }), 0.2, 3.3, 6.2, 0.8);
  H.lager = house({ x: -13, z: -13, w: 10, d: 7, to: [-13, 4], wall: 'vert', color: '#8a2d23', roof: 'corr', roofColor: '#5b5f62', doorColor: '#4a2a22', name: 'lager', chimney: false, windows: false, pitch: 0.5 });
  { // stor låveport
    const g = H.lager; const port = mesh(new THREE.BoxGeometry(3.2, 3.0, 0.12), flat('#6a2018', 0.9));
    port.position.set(g.userData.dx, 1.8, g.userData.d / 2 + 0.12); g.add(port);
    const x1 = mesh(new THREE.BoxGeometry(0.16, 3.4, 0.05), tmFlat()); x1.rotation.z = 0.8; x1.position.copy(port.position).add(V(0, 0, 0.08)); g.add(x1);
    const x2 = x1.clone(); x2.rotation.z = -0.8; g.add(x2);
  }
  function tmFlat() { return flat('#eee9dc', 0.8); }
  // telegraf (grønt hus, værmelding)
  H.telegraf = house({ x: 14, z: 13, w: 8, d: 6.2, floors: 2, fh: 2.5, to: [14, 4], wall: 'clap', color: '#5c7d5b', roofColor: '#7a3a2a', doorColor: '#eee9dc', name: 'telegraf', pitch: 0.7 });
  wallSign(H.telegraf, sign([{ text: 'TELEGRAFSTASJON', size: 66 }], { w: 768, h: 120, bg: '#f2f0e8', fg: '#2a3b66', border: '#2a3b66' }), 0.3, 3.0, 5.4, 0.7);
  // havnekontor (loggbok)
  H.havn = house({ x: 24, z: 13.5, w: 6, d: 4.8, to: [24, 4], wall: 'clap', color: '#e6e1d4', trim: '#2a3b66', roofColor: '#8c3a2b', doorColor: '#2a3b66', name: 'havn' });
  wallSign(H.havn, sign([{ text: 'HAVNEKONTOR', size: 62 }], { w: 640, h: 100, bg: '#2a3b66', fg: '#f2f0e8' }), 0, 2.85, 3.6, 0.5);
  // fiskemottak
  H.mottak = house({ x: 28, z: 30, w: 14, d: 8.5, fh: 3.4, to: [60, 30], wall: 'vert', color: '#9c3e2a', roof: 'corr', roofColor: '#6a6e70', doorColor: '#3b2f27', name: 'mottak', chimney: false, windows: false, pitch: 0.42 });
  {
    const g = H.mottak;
    wallSign(g, sign([{ text: 'FISKEMOTTAK', size: 96 }], { w: 1024, h: 160, bg: '#e6dfcc', fg: '#2d2824' }), 3.5, 3.15, 6.6, 0.9);
    for (const px of [-4.5, 0, 4.5]) { // brede låveporter mot sjøen
      const p = mesh(new THREE.BoxGeometry(3.0, 2.4, 0.1), flat('#4a3128', 0.9)); p.position.set(px, 1.5, 4.33); g.add(p);
    }
    for (let k = 0; k < 3; k++) addWindow(g, -3 + k * 3, 3.5, -4.25, Math.PI, 0.9, 0.7);
  }
  // skiltmåler
  H.skilt = house({ x: 3, z: 19, w: 6.5, d: 5, to: [-3, 13], wall: 'clap', color: '#ece8dc', trim: '#3d5a80', roofColor: '#463e3b', doorColor: '#c8452f', name: 'skilt' });
  wallSign(H.skilt, sign([{ text: 'SKILTMÅLER', size: 70 }], { w: 640, h: 100, bg: '#3d5a80', fg: '#f2f0e8' }), 0, 2.85, 3.8, 0.5);
  // boliger
  const dw = [
    { x: -24, z: 18, w: 7, d: 5.5, floors: 2, to: [-16, 24], color: '#a63a2c', roofColor: '#44403f' },
    { x: -22, z: -5, w: 7, d: 5.5, to: [-22, 7], color: '#e7d9a8', trim: '#8a2d23', roofColor: '#7a3a2a' },
    { x: -8, z: 33, w: 6.5, d: 5, to: [-14, 28], color: '#b8452f', roofColor: '#3f3a39' },
    { x: 9, z: 27, w: 6, d: 5, to: [4, 22], color: '#c99a3a', roofColor: '#4a4140', floors: 1 },
    { x: 20, z: -4, w: 7, d: 5.5, floors: 2, to: [20, 6], color: '#ece7da', trim: '#6b3a2c', roofColor: '#3c3838' },
    { x: -34, z: 12, w: 6, d: 5, to: [-28, 7], color: '#6f8aa0', roofColor: '#4a4040' },
    { x: -42, z: -6, w: 6.5, d: 5, to: [-34, -8], color: '#cbbf9f', trim: '#7c3a2c', roofColor: '#5a3b34' },
    { x: -28, z: 41, w: 6, d: 5, to: [-19, 40], color: '#d7c9a0', roofColor: '#4b4442' },
    { x: -2, z: 44, w: 7, d: 5.5, floors: 2, to: [-2, 36], color: '#8f3a2b', roofColor: '#403a39' },
    { x: 24, z: -26, w: 7, d: 5.5, to: [24, -13], color: '#d9d2bf', trim: '#8a2d23', roofColor: '#5a4a44' },
  ];
  dw.forEach((o, i) => house({ ...o, name: 'bolig' + i }));
  // sjøhus / rorbuer rett ved kaia
  [[-35, '#8f2f26'], [-27, '#b3822f'], [-20, '#8f2f26']].forEach(([zz, col], i) => {
    const xx = sx(zz) - 9.5;
    house({ x: xx, z: zz, w: 6, d: 5, rot: Math.PI / 2, wall: 'vert', color: col, trim: '#eee9dc', roof: 'tile', roofColor: '#3d3835', name: 'rorbu' + i, windows: true, chimney: false, pitch: 0.55, doorColor: '#2f3a3a' });
  });
  [[50, '#a88b3a'], [56, '#8f2f26']].forEach(([zz, col], i) => {
    const xx = sx(zz) - 9.5;
    house({ x: xx, z: zz, w: 6, d: 5, rot: Math.PI / 2, wall: 'vert', color: col, trim: '#eee9dc', roofColor: '#3d3835', name: 'sjohus' + i, chimney: false, pitch: 0.55 });
  });

  // ---------- skilt ved veien ----------
  function postSign(x, z, face, lines, opts, w = 3.2, h = 1.1) {
    const g = new THREE.Group();
    g.position.set(x, groundAt(x, z), z); g.rotation.y = face;
    const wood = flat('#4d3b2c', 0.95);
    for (const s of [-1, 1]) { const p = mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16), wood); p.position.set(s * (w / 2 - 0.15), 1.3, 0); g.add(p); }
    const board = mesh(new THREE.BoxGeometry(w, h, 0.1), flat('#cfc8b4', 0.8)); board.position.set(0, 2.0, 0); g.add(board);
    for (const s of [1, -1]) {
      const face2 = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, h - 0.1), new THREE.MeshStandardMaterial({ map: sign(lines, opts), roughness: 0.8 }));
      face2.position.set(0, 2.0, s * 0.056); if (s < 0) face2.rotation.y = Math.PI; g.add(face2);
    }
    root.add(g);
    obb(x, z, w / 2, 0.3, face);
  }
  postSign(-13.5, 31.5, -1.2, [{ text: 'RØSTNESVÅG', size: 74 }, { text: 'fiskevær', size: 44, style: 'italic' }], { w: 640, h: 220, bg: '#2a3b66', fg: '#f2f0e8', border: '#f2f0e8' }, 3.2, 1.3);
  postSign(-6.5, 12, -0.5, [{ text: 'VÆRØY', size: 54 }, { text: 'GAMLE HANDELSSTED', size: 48 }, { text: 'ANNO 1795', size: 60 }], { w: 768, h: 288, bg: '#efe9d8', fg: '#1f2d57', border: '#1f2d57' }, 3.8, 1.5);

  // ---------- telegrafstolper ----------
  {
    const pts = [];
    const along = [[36, 4], [24, 4.2], [12, 4.5], [1, 5.2], [-5, 12.2], [-10, 19.8], [-16, 27.5], [-22, 34]];
    const poleM = flat('#5a4a3a', 0.95);
    const lineMat = new THREE.LineBasicMaterial({ color: '#1e1e1e' });
    along.forEach(([px, pz]) => {
      const g = new THREE.Group(); g.position.set(px, groundAt(px, pz), pz);
      const p = mesh(new THREE.CylinderGeometry(0.1, 0.16, 7.4, 8), poleM); p.position.y = 3.7; g.add(p);
      const arm = mesh(new THREE.BoxGeometry(1.8, 0.1, 0.1), poleM); arm.position.y = 6.9; g.add(arm);
      root.add(g); circ(px, pz, 0.35);
      pts.push(V(px, g.position.y + 6.9, pz));
    });
    const verts = [];
    for (let i = 0; i < pts.length - 1; i++) for (const o of [-0.8, 0.8]) {
      const a = pts[i].clone().add(V(0, 0, o)), b = pts[i + 1].clone().add(V(0, 0, o));
      const n = 8;
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
        const L = a.distanceTo(b);
        p0.y -= Math.sin(t0 * Math.PI) * L * 0.03; p1.y -= Math.sin(t1 * Math.PI) * L * 0.03;
        verts.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    root.add(new THREE.LineSegments(lg, lineMat));
  }

  // ---------- hjeller ----------
  const fishGeo = new THREE.SphereGeometry(1, 8, 6); fishGeo.scale(0.055, 0.3, 0.03);
  const maxFish = 2600;
  const fishMesh = new THREE.InstancedMesh(fishGeo, new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.95 }), maxFish);
  fishMesh.castShadow = true; fishMesh.receiveShadow = true;
  let nFish = 0;
  const fishCol = new THREE.Color();
  function hjell(cx, cz, len, rot) {
    const g = new THREE.Group(); g.position.set(cx, groundAt(cx, cz) - 0.05, cz); g.rotation.y = rot; root.add(g);
    g.updateMatrixWorld(true);
    const wood = flat('#6b5a48', 0.95);
    const nF = Math.round(len / 2.8) + 1;
    const H0 = 4.6, W0 = 1.2;
    for (let i = 0; i < nF; i++) {
      const x = -len / 2 + i * (len / (nF - 1));
      for (const s of [-1, 1]) {
        const leg = mesh(new THREE.CylinderGeometry(0.06, 0.08, Math.hypot(H0, W0), 6), wood);
        leg.position.set(x, H0 / 2, s * W0 / 2 * 0.5 * 1);
        leg.rotation.x = s * Math.atan2(W0 * 0.5 * 2 / 2, H0) * 1.0;
        leg.position.set(x, H0 / 2, s * W0 * 0.25);
        leg.rotation.x = -s * Math.atan2(W0 * 0.5, H0);
        g.add(leg);
      }
    }
    const rails = [];
    for (const y of [1.2, 2.3, 3.4]) {
      const off = W0 * 0.5 * (1 - y / H0) + 0.04;
      for (const s of [-1, 1]) {
        const r = mesh(new THREE.CylinderGeometry(0.045, 0.045, len + 0.8, 6), wood);
        r.rotation.z = Math.PI / 2; r.position.set(0, y, s * off); g.add(r);
        rails.push([y, s * off]);
      }
    }
    const rg = new THREE.Matrix4(), ro = new THREE.Matrix4(), sc = new THREE.Matrix4(), rz = new THREE.Matrix4();
    for (const [y, zz] of rails) {
      for (let x = -len / 2 + 0.3; x < len / 2 - 0.2; x += 0.2 + R() * 0.05) {
        if (nFish >= maxFish) break;
        const h = rr(0.8, 1.1);
        rg.makeTranslation(x, y - 0.32 * h, zz + rr(-0.03, 0.03));
        ro.makeRotationFromEuler(new THREE.Euler(rr(-0.05, 0.05), rr(-0.7, 0.7) + (R() < 0.5 ? 0 : Math.PI / 2), rr(-0.08, 0.08)));
        sc.makeScale(1, h, 1);
        const m = new THREE.Matrix4().copy(g.matrixWorld).multiply(rg).multiply(ro).multiply(sc);
        fishMesh.setMatrixAt(nFish, m);
        const tone = rr(0, 1);
        fishCol.set('#d8cfb8').lerp(new THREE.Color('#a9967a'), tone * 0.8);
        fishMesh.setColorAt(nFish, fishCol);
        nFish++;
      }
    }
    obb(cx, cz, len / 2 + 0.5, 0.9, rot);
  }
  [-22, -30, -38].forEach((z) => hjell(-46, z, 12, 0));
  [-26, -34, -42].forEach((z) => hjell(-24, z, 12, 0));
  fishMesh.count = nFish; root.add(fishMesh);

  // ---------- fatstabler, kasser, tønner ----------
  const barrelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.95, 14);
  const barrelMat = new THREE.MeshStandardMaterial({ map: barrel(), roughness: 0.85 });
  const crateGeo = new THREE.BoxGeometry(0.9, 0.5, 0.6);
  const crateMat = new THREE.MeshStandardMaterial({ map: crate(), roughness: 0.9 });
  function barrels(x, z, n = 3) {
    for (let i = 0; i < n; i++) {
      const b = mesh(barrelGeo, barrelMat); const y = onQuay(x, z, rects) ? QUAY_Y : groundAt(x, z);
      b.position.set(x + (i % 2) * 0.8 + rr(-0.05, 0.05), y + 0.47, z + Math.floor(i / 2) * 0.8); root.add(b);
    }
    circ(x + 0.4, z + 0.4, 1.0);
  }
  function crates(x, z, nx = 2, ny = 2, rot = 0) {
    const y0 = onQuay(x, z, rects) ? QUAY_Y : groundAt(x, z);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = mesh(crateGeo, crateMat);
      c.position.set(x + i * 0.92, y0 + 0.25 + j * 0.5, z); c.rotation.y = rot + rr(-0.04, 0.04); root.add(c);
    }
    circ(x + nx * 0.46, z, nx * 0.5 + 0.2);
  }
  barrels(-6.5, 5.4, 4); barrels(31, 1.2, 3);
  crates(sx(28) - 0.5, 28.6, 3, 3); crates(sx(34) - 0.5, 34.5, 2, 2);
  crates(-3.4, 4.2, 2, 2); crates(sx(-6) - 1, -6.7, 2, 3);
  barrels(sx(40) + 0.4, 40, 3);

  // ---------- gjerder ----------
  function fence(x1, z1, x2, z2, col = '#e9e4d6', hgt = 1.0) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.round(len / 0.55);
    const post = new THREE.BoxGeometry(0.08, hgt, 0.04);
    const im = new THREE.InstancedMesh(post, flat(col, 0.85), n + 1);
    const m = new THREE.Matrix4(), a = Math.atan2(x2 - x1, z2 - z1);
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = x1 + (x2 - x1) * t, pz = z1 + (z2 - z1) * t;
      m.makeRotationY(a).setPosition(px, groundAt(px, pz) + hgt / 2, pz); im.setMatrixAt(i, m);
    }
    im.castShadow = true; root.add(im);
    for (const yy of [0.3, 0.75]) {
      const r = mesh(new THREE.BoxGeometry(0.05, 0.06, len), flat(col, 0.85));
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      r.position.set(mx, groundAt(mx, mz) + yy, mz); r.rotation.y = a; root.add(r);
    }
    obb((x1 + x2) / 2, (z1 + z2) / 2, 0.15, len / 2, a);
  }
  fence(-27.5, 14, -20.5, 14); fence(-27.5, 14, -27.5, 24); fence(-27.5, 24, -20.5, 24);
  fence(-27, -10, -17, -10); fence(-17, -10, -17, -1);
  fence(15, -8, 25, -8); fence(25, -8, 25, 0);

  // ---------- sperringer ved bygdas ytterkant ----------
  const rockGeo = new THREE.IcosahedronGeometry(1, 3);
  {
    const nz = createNoise(91);
    const p = rockGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + nz.noise2(x * 1.6 + 3, y * 1.6 + z * 1.2) * 0.32;
      p.setXYZ(i, x * k, y * k * 0.78, z * k);
    }
    rockGeo.computeVertexNormals();
  }
  const rocks = [];
  function rock(x, z, s, sink = 0.25) { rocks.push([x, z, s, sink]); }
  // bergrekke langs ytterkanten (ikke mot sjøen)
  for (let z = BOUNDS.minZ - 2; z <= BOUNDS.maxZ + 3; z += 1.5) rock(BOUNDS.minX - 1.5 + rr(-1, 1.5), z + rr(-0.5, 0.5), rr(1.0, 2.3));
  for (let x = BOUNDS.minX; x <= shoreX(BOUNDS.minZ) - 1; x += 1.6) {
    rock(x + rr(-0.4, 0.4), BOUNDS.minZ - 1 + rr(-1, 1.5), rr(1.0, 2.4));
  }
  for (let x = BOUNDS.minX; x <= shoreX(BOUNDS.maxZ) - 1; x += 1.6) rock(x + rr(-0.4, 0.4), BOUNDS.maxZ + 0.5 + rr(-1.5, 1), rr(1.0, 2.4));
  // tilfeldige steiner i bygda og langs fjæra
  for (let i = 0; i < 140; i++) {
    const x = rr(-52, 38), z = rr(-52, 58);
    if (pathDist(x, z) < 3 || onQuay(x, z, rects)) continue;
    if (x > shoreX(z) - 2) continue;
    if (colliders.some((c) => c.t === 'obb' && Math.hypot(c.x - x, c.z - z) < Math.max(c.hx, c.hz) + 2.5)) continue;
    rock(x, z, rr(0.25, 0.9), 0.1);
  }
  for (let i = 0; i < 90; i++) { // fjæresteiner
    const z = rr(-52, 58), x = shoreX(z) + rr(-6, 2);
    rock(x, z, rr(0.35, 1.2), 0.2);
  }
  // sperring med hesteskjerre (kjerre) ved nordenden, stengsel ved vest og sør
  function cart(x, z, rot) {
    const g = new THREE.Group(); g.position.set(x, groundAt(x, z), z); g.rotation.y = rot;
    const wood = flat('#6b4c30', 0.95), dark = flat('#2e2a26', 0.9);
    const bed = mesh(new THREE.BoxGeometry(2.6, 0.12, 1.3), wood); bed.position.y = 0.85; g.add(bed);
    for (const s of [-1, 1]) {
      const side = mesh(new THREE.BoxGeometry(2.6, 0.45, 0.07), wood); side.position.set(0, 1.14, s * 0.62); g.add(side);
      const wh = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 16), dark); wh.rotation.x = Math.PI / 2; wh.position.set(-0.3, 0.55, s * 0.78); g.add(wh);
      const hub = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), wood); hub.rotation.x = Math.PI / 2; hub.position.set(-0.3, 0.55, s * 0.8); g.add(hub);
      for (let k = 0; k < 4; k++) {
        const sp = mesh(new THREE.BoxGeometry(1.08, 0.05, 0.05), wood); sp.rotation.z = k * Math.PI / 4; sp.position.set(-0.3, 0.55, s * 0.78); g.add(sp);
      }
      const shaft = mesh(new THREE.BoxGeometry(2.4, 0.07, 0.07), wood); shaft.position.set(2.0, 0.8, s * 0.35); shaft.rotation.z = -0.12; g.add(shaft);
    }
    const bk = mesh(new THREE.BoxGeometry(0.07, 0.45, 1.3), wood); bk.position.set(-1.3, 1.14, 0); g.add(bk);
    root.add(g);
    obb(x, z, 2.2, 1.0, rot);
  }
  cart(-3, -49, 0.4);
  { // grind (port) og gjerde ved vestenden
    const g = new THREE.Group(); g.position.set(-50, groundAt(-50, 2), 2); g.rotation.y = Math.PI / 2;
    const wood = flat('#5a4634', 0.95);
    for (const s of [-1, 1]) {
      const p = mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), wood); p.position.set(s * 2.0, 1.1, 0); g.add(p);
      const leaf = new THREE.Group(); leaf.position.set(s * 1.9, 0, 0);
      for (const y of [0.35, 0.9, 1.45]) { const b = mesh(new THREE.BoxGeometry(1.8, 0.14, 0.05), wood); b.position.set(-s * 0.9, y, 0); leaf.add(b); }
      const dg = mesh(new THREE.BoxGeometry(2.0, 0.1, 0.05), wood); dg.position.set(-s * 0.9, 0.9, 0); dg.rotation.z = s * 0.45; leaf.add(dg);
      for (const k of [0.1, 0.9, 1.75]) { const b = mesh(new THREE.BoxGeometry(0.1, 1.6, 0.06), wood); b.position.set(-s * k, 0.9, 0); leaf.add(b); }
      g.add(leaf);
    }
    root.add(g);
    obb(-50, 2, 0.3, 2.3, 0);
    fence(-50, -4, -50, -1.4, '#7a6a55', 1.2); fence(-50, 5.4, -50, 12, '#7a6a55', 1.2);
    fence(-50, -22, -50, -4, '#7a6a55', 1.2); fence(-50, 12, -50, 20, '#7a6a55', 1.2);
  }
  { // høystakk-rader og stengsel i sør
    for (let i = 0; i < 5; i++) {
      const bale = mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.1, 14), flat(i % 2 ? '#c5b06a' : '#bfa85f', 1));
      bale.rotation.z = Math.PI / 2; bale.position.set(-34 + i * 1.5, groundAt(-34, 54) + 0.6, 54); root.add(bale);
    }
    obb(-30.5, 54, 4.2, 0.8, 0);
    fence(-34, 55.5, -22, 55.5, '#7a6a55', 1.3);
  }

  // rock instanser
  {
    const im = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.95 }), rocks.length);
    const m = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler();
    rocks.forEach((r, i) => {
      const [x, z, s, sink] = r;
      e.set(rr(-0.3, 0.3), rr(0, 6.28), rr(-0.3, 0.3)); q.setFromEuler(e);
      m.compose(V(x, heightAt(x, z) - sink * s, z), q, V(s * rr(0.9, 1.4), s * rr(0.7, 1.1), s * rr(0.9, 1.3)));
      im.setMatrixAt(i, m);
      c.set(R() < 0.5 ? '#74756f' : '#585b59').lerp(new THREE.Color('#8f9b7c'), R() * 0.25);
      im.setColorAt(i, c);
    });
    im.castShadow = true; im.receiveShadow = true; root.add(im);
  }

  // ---------- gress ----------
  {
    const w = 0.7, h = 0.42;
    const pos = [], uv = [], idx = [];
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), b = pos.length / 3;
      pos.push(-w / 2 * ca, 0, w / 2 * sa, w / 2 * ca, 0, -w / 2 * sa, w / 2 * ca, h, -w / 2 * sa, -w / 2 * ca, h, w / 2 * sa);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    gg.setIndex(idx); gg.computeVertexNormals();
    const gm = new THREE.MeshStandardMaterial({ map: grassTuft(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
    const count = 5000;
    const im = new THREE.InstancedMesh(gg, gm, count);
    const m = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion();
    let n = 0, tries = 0;
    while (n < count && tries < 60000) {
      tries++;
      const x = rr(-56, 40), z = rr(-56, 62);
      if (x > shoreX(z) - 1.5) continue;
      if (pathDist(x, z) < 1.6) continue;
      const y = heightAt(x, z);
      if (y < 0.5 || y > 4) continue;
      let bad = false;
      for (const k of colliders) {
        if (k.t === 'circle') { if (Math.hypot(k.x - x, k.z - z) < k.r) { bad = true; break; } }
        else {
          const dx = x - k.x, dz = z - k.z, ca = Math.cos(k.a), sa = Math.sin(k.a);
          if (Math.abs(dx * ca - dz * sa) < k.hx + 0.2 && Math.abs(dx * sa + dz * ca) < k.hz + 0.2) { bad = true; break; }
        }
      }
      if (bad) continue;
      q.setFromAxisAngle(V(0, 1, 0), rr(0, 6.28));
      const s = rr(0.6, 1.3);
      m.compose(V(x, y - 0.03, z), q, V(s, s * rr(0.8, 1.3), s));
      im.setMatrixAt(n, m);
      c.set('#a3b25a').lerp(new THREE.Color('#c4bd78'), rr(0, 0.7)).multiplyScalar(rr(0.85, 1.2));
      im.setColorAt(n, c);
      n++;
    }
    im.count = n; im.receiveShadow = true; root.add(im);
  }

  // ---------- båter ----------
  function placeBoat(x, z, rotY, opts, y = -0.2) {
    const HULLS = ['#4a3426', '#6b2f26', '#2f4a50', '#7d6a4a', '#d9d3c2', '#3a3f4a'];
    const b = makeBoat({ hull: HULLS[Math.floor(R() * HULLS.length)], ...opts });
    b.position.set(x, y, z); b.rotation.y = rotY;
    root.add(b); boats.push({ obj: b, phase: R() * 6, ashore: !!opts.ashore });
    return b;
  }
  const edge = (z) => sx(z) + 4;
  // fortøyd langs kaia (lengde langs z)
  [[-30, 9.6], [-24.5, 8.2], [-17, 10.4], [-9, 8.8], [20, 9.4], [30, 10.2], [38, 8.0], [46, 9.0]].forEach(([z, L]) => {
    placeBoat(edge(z) + 0.85, z + rr(-0.5, 0.5), Math.PI / 2 + rr(-0.04, 0.04), { length: L, beam: 1.2 + L * 0.015, sail: false });
  });
  // ved bryggeendene
  const sp = sx(6);
  placeBoat(sp + 12, 2.9, 0.05, { length: 9, sail: false });
  placeBoat(sp + 16, 9.2, -0.04, { length: 10.5, sail: true });
  // ankret i bukta
  [[72, 24, 1.2], [90, -16, 2.4], [66, -34, 0.5], [105, 18, 4.0]].forEach(([x, z, r]) => placeBoat(x, z, r, { length: rr(8, 11), sail: R() < 0.5 }));
  // på land
  [[24.5, -8.5, 0.1], [22.5, -3.2, -0.15]].forEach(([x, z, r]) => {
    const b = placeBoat(x, z, Math.PI / 2 + r, { length: 8.2, ashore: true, sail: false }, groundAt(x, z) + 0.45);
    b.rotation.z = 0.04;
    obb(x, z, 1.0, 4.3, 0);
  });

  // ---------- lykter ----------
  {
    const bulbMat = new THREE.MeshStandardMaterial({ color: '#443d34', emissive: new THREE.Color('#ffc66a'), emissiveIntensity: 0, roughness: 0.4 });
    lamps.push(bulbMat);
    const pole = flat('#2c2824', 0.7);
    const mk = (x, z, y0) => {
      const g = new THREE.Group(); g.position.set(x, y0, z);
      const p = mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 6), pole); p.position.y = 1.6; g.add(p);
      const lamp = mesh(new THREE.BoxGeometry(0.3, 0.38, 0.3), bulbMat); lamp.position.y = 3.35; lamp.castShadow = false; g.add(lamp);
      const cap = mesh(new THREE.ConeGeometry(0.28, 0.2, 4), pole); cap.position.y = 3.65; cap.rotation.y = Math.PI / 4; g.add(cap);
      root.add(g); circ(x, z, 0.25);
    };
    for (let z = -32; z <= 50; z += 14) mk(sx(z) + 3.2, z + 0.5, QUAY_Y);
    mk(sp + 22, 6, QUAY_Y);
    mk(-6.5, 7, groundAt(-6.5, 7)); mk(-14, 22, groundAt(-14, 22)); mk(18, 7.5, groundAt(18, 7.5));
  }

  // ---------- interaksjon ----------
  const door = (h, extra = 2.2) => {
    const { a, d, dx } = h.userData;
    const lx = dx, lz = d / 2 + extra;
    return [h.position.x + lx * Math.cos(a) + lz * Math.sin(a), h.position.z - lx * Math.sin(a) + lz * Math.cos(a)];
  };
  const ia = (id, key, label, pos, r = 3.2) => interactables.push({ id, key, label, x: pos[0], z: pos[1], r });
  ia('kjopmann', 'kolonial', 'Kjøpmannen', door(H.kolonial));
  ia('loggbok', 'loggbok', 'Loggboka', door(H.havn));
  ia('vaermelding', 'vaermelding', 'Værmeldinga', door(H.telegraf));
  ia('fiskemottak', 'fiskemottak', 'Fiskemottaket', [sx(30) - 7.5, 30], 4);
  ia('skiltmalar', 'skiltmalar', 'Skiltmålaren', door(H.skilt));
  ia('hjell', 'hjell', 'Hjellane', [-35, -31], 6);
  ia('skilt', 'skilt', 'Skiltet', [-13.5, 30], 3);
  ia('baat', 'baat', 'Nordlandsbåten', [23.5, -6], 4);

  function update(time, glow) {
    for (const b of boats) if (!b.ashore) b.obj.userData.update(time, b.phase);
    const k = glow * 1.4;
    lamps.forEach((m) => { m.emissiveIntensity = k * 1.6; });
    winMat.emissiveIntensity = k;
  }

  // vinduer som instanser
  const frameGeo = new THREE.BoxGeometry(1, 1, 1);
  const winMat = new THREE.MeshStandardMaterial({ color: '#27343d', roughness: 0.25, emissive: new THREE.Color('#ffc874'), emissiveIntensity: 0 });
  const white = flat('#eee9dc', 0.7);
  for (const [k, mat] of [['frame', white], ['pane', winMat], ['mv', white], ['mh', white]]) {
    const arr = winData[k];
    const im = new THREE.InstancedMesh(frameGeo, mat, Math.max(1, arr.length));
    arr.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = k === 'frame'; im.receiveShadow = true;
    root.add(im);
  }

  return { root, colliders, interactables, boats, quayRects: rects, update, houses: H };
}
