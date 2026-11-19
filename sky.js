// Himmel (skyer), lys og lysstemninger.
import * as THREE from 'three';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;

const SKY_FRAG = /* glsl */`
uniform vec3 uSunDir, uSunColor, uZenith, uHorizon;
uniform float uTime, uCover, uGlow;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=vn(p)*a; p*=2.03; a*=.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0., 1.);
  vec3 col = mix(uHorizon, uZenith, pow(h, .5));
  vec2 uv = d.xz / (h + .18) * .9 + vec2(uTime * .006, uTime * .002);
  float n = fbm(uv * 1.4);
  float cl = smoothstep(1. - uCover - .12, 1. - uCover + .28, n);
  float shade = fbm(uv * 3.2 + 7.);
  float sd = max(dot(d, uSunDir), 0.);
  vec3 cloud = mix(vec3(.50,.55,.60), vec3(.90,.92,.94), shade);
  cloud = mix(cloud, uHorizon * 1.05, .25);
  cloud += uSunColor * pow(sd, 5.) * .55 * (1. - cl * .3);
  col = mix(col, cloud, cl * smoothstep(-.02, .14, d.y));
  col += uSunColor * (pow(sd, 90.) * 1.2 + pow(sd, 7.) * .28 * uGlow);
  if (d.y < 0.) col = mix(uHorizon, uHorizon * .85, clamp(-d.y * 3., 0., 1.));
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const PRESETS = {
  dag: {
    name: 'Overskya dag',
    sunEl: 28, sunAz: 205, sunColor: '#fff0dc', sunI: 2.3,
    hemiSky: '#aebfd0', hemiGround: '#6a6a54', hemiI: 1.6,
    zenith: '#7b91a6', horizon: '#bcc7cb', fog: '#b3bfc5', fogD: 0.00055,
    cover: 0.78, glow: 0.4, exposure: 0.82, win: 0,
    deep: '#0f3b49', shallow: '#3f8f8b',
  },
  kveld: {
    name: 'Kveldssol',
    sunEl: 6, sunAz: 40, sunColor: '#ffb066', sunI: 2.9,
    hemiSky: '#8fa0c0', hemiGround: '#665548', hemiI: 1.25,
    zenith: '#4b6283', horizon: '#efb48c', fog: '#d6ae96', fogD: 0.00060,
    cover: 0.55, glow: 1.0, exposure: 0.86, win: 1,
    deep: '#102f40', shallow: '#4a7f80',
  },
};

export function createSky(scene, renderer, water) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(9000, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uTime: { value: 0 }, uCover: { value: 0.7 }, uGlow: { value: 0.5 },
      },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    })
  );
  sky.renderOrder = -100; sky.frustumCulled = false;
  scene.add(sky);

  const sun = new THREE.DirectionalLight('#fff', 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.35;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#fff', '#888', 1);
  scene.add(hemi);
  scene.fog = new THREE.FogExp2('#b3bfc5', 0.00055);

  const cur = {
    sunEl: 28, sunAz: 205, sunI: 2.3, hemiI: 1, fogD: 0.0005, cover: 0.7, glow: 0.4, exposure: 0.85, win: 0,
    sunColor: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
    zenith: new THREE.Color(), horizon: new THREE.Color(), fog: new THREE.Color(), deep: new THREE.Color(), shallow: new THREE.Color(),
  };
  let target = PRESETS.dag, key = 'dag';
  function snap(k) { target = PRESETS[k]; key = k; apply(1); }
  function apply(a) {
    const T = target;
    for (const f of ['sunEl', 'sunAz', 'sunI', 'hemiI', 'fogD', 'cover', 'glow', 'exposure', 'win']) cur[f] += (T[f] - cur[f]) * a;
    for (const f of ['sunColor', 'hemiSky', 'hemiGround', 'zenith', 'horizon', 'fog', 'deep', 'shallow']) cur[f].lerp(new THREE.Color(T[f]), a);
  }
  const dir = new THREE.Vector3();
  function update(dt, time, focus) {
    apply(Math.min(1, dt * 1.6));
    const el = THREE.MathUtils.degToRad(cur.sunEl), az = THREE.MathUtils.degToRad(cur.sunAz);
    dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    sun.color.copy(cur.sunColor); sun.intensity = cur.sunI;
    sun.position.copy(focus).addScaledVector(dir, 120); sun.target.position.copy(focus);
    hemi.color.copy(cur.hemiSky); hemi.groundColor.copy(cur.hemiGround); hemi.intensity = cur.hemiI;
    scene.fog.color.copy(cur.fog); scene.fog.density = cur.fogD;
    renderer.toneMappingExposure = cur.exposure;
    const u = sky.material.uniforms;
    u.uSunDir.value.copy(dir); u.uSunColor.value.copy(cur.sunColor).multiplyScalar(0.8);
    u.uZenith.value.copy(cur.zenith); u.uHorizon.value.copy(cur.horizon); u.uTime.value = time;
    u.uCover.value = cur.cover; u.uGlow.value = cur.glow;
    sky.position.copy(focus);
    const w = water.uniforms;
    w.uSunDir.value.copy(dir); w.uSunColor.value.copy(cur.sunColor);
    w.uHorizon.value.copy(cur.horizon); w.uZenith.value.copy(cur.zenith); w.uFogColor.value.copy(cur.fog);
    w.uFogDensity.value = cur.fogD; w.uDeep.value.copy(cur.deep); w.uShallow.value.copy(cur.shallow); w.uTime.value = time;
  }
  return {
    update, snap, cur,
    next() { key = key === 'dag' ? 'kveld' : 'dag'; target = PRESETS[key]; return PRESETS[key].name; },
    set(k) { key = k; target = PRESETS[k]; },
    get key() { return key; },
    get windowGlow() { return cur.win; },
  };
}
