import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ============================================================
   COSMOS — a scroll-driven 3D journey through space
   Built for the 3D Websites Hackathon.

   Chapters: Departure -> Mars -> Gas Giant -> Nebula -> Black Hole -> Portal

   Highlights:
   - Scroll-driven cinematic camera flying along a Catmull-Rom spline
   - Twinkling, glowing stars via a custom point shader
   - Fresnel "atmosphere" glow shader on planets
   - Randomly spawned comets streaking across the sky
   - Click-to-explore planets with info cards (real interactivity, not just scroll)
   - A gravitational-lensing screen-space distortion pass around a black hole
   - Custom glowing cursor + optional generated ambient soundscape
   ============================================================ */

const canvas = document.getElementById('bg');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060c, 0.0016);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);

/* ---------------- Lighting ---------------- */
scene.add(new THREE.AmbientLight(0x404060, 1.1));
const sunLight = new THREE.PointLight(0xfff2d0, 3, 0, 0);
sunLight.position.set(-400, 80, -600);
scene.add(sunLight);

const rimLight = new THREE.PointLight(0x7dd8ff, 2, 0, 0);
rimLight.position.set(300, -100, 200);
scene.add(rimLight);

/* ---------------- Soft circular sprite texture (used for stars/nebula/comets) ---------------- */
function makeGlowTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
const glowTex = makeGlowTexture();

/* ---------------- Twinkling starfield (custom shader) ---------------- */
const starVertexShader = `
  attribute float aRandom;
  attribute float aSize;
  uniform float uTime;
  varying float vAlpha;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (420.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    vAlpha = 0.45 + 0.55 * sin(uTime * (0.6 + aRandom * 1.8) + aRandom * 6.2831);
  }
`;
const starFragmentShader = `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(uColor, tex.a * vAlpha);
  }
`;

function makeTwinklingStars(count, radius, size, color) {
  const positions = new Float32Array(count * 3);
  const randoms = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = radius * (0.4 + Math.random() * 0.6);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    randoms[i] = Math.random();
    sizes[i] = size * (0.6 + Math.random() * 0.8);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMap: { value: glowTex }, uColor: { value: new THREE.Color(color) } },
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

const starLayers = [
  makeTwinklingStars(5000, 2200, 3.2, 0xffffff),
  makeTwinklingStars(2200, 1400, 5.0, 0x9fd8ff),
  makeTwinklingStars(800, 900, 7.5, 0xffe3c2),
];
starLayers.forEach((s) => scene.add(s));

/* ---------------- Fresnel atmosphere glow (shader material) ---------------- */
const atmosphereVertex = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const atmosphereFragment = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  uniform vec3 glowColor;
  uniform float power;
  uniform float intensityMul;
  void main() {
    vec3 viewDir = normalize(vViewPosition);
    // Fresnel rim: 0 at the center of the sphere (facing camera), 1 at the grazing edge.
    float fresnel = pow(1.0 - clamp(dot(vNormal, viewDir), 0.0, 1.0), power);
    gl_FragColor = vec4(glowColor, fresnel * intensityMul);
  }
`;
function makeAtmosphere(radius, color, power = 2.5) {
  const geo = new THREE.SphereGeometry(radius * 1.08, 48, 48);
  const mat = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertex,
    fragmentShader: atmosphereFragment,
    uniforms: { glowColor: { value: new THREE.Color(color) }, power: { value: power }, intensityMul: { value: 0.55 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  return new THREE.Mesh(geo, mat);
}

/* ---------------- Planets ---------------- */
const clickable = []; // meshes the user can click to learn more about

function makePlanet({ id, radius, position, color, emissive = 0x000000, ring = false, roughness = 0.85, atmosphere = null, facts }) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(radius, 48, 48);
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.15, emissive, emissiveIntensity: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(position);
  mesh.userData = { id, facts, baseScale: 1 };
  group.add(mesh);
  clickable.push(mesh);

  if (atmosphere) {
    const glow = makeAtmosphere(radius, atmosphere);
    glow.position.copy(position);
    group.add(glow);
  }

  if (ring) {
    const ringGeo = new THREE.RingGeometry(radius * 1.4, radius * 2.1, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: ring, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.copy(position);
    ringMesh.rotation.x = Math.PI / 2.4;
    group.add(ringMesh);
  }
  scene.add(group);
  return { group, mesh };
}

const earth = makePlanet({
  id: 'earth', radius: 26, position: new THREE.Vector3(60, -20, -80),
  color: 0x2f6fb0, emissive: 0x0a1f33, atmosphere: 0x6fc3ff,
  facts: { title: 'Home', text: 'Every journey has a beginning. This pale blue dot is ours — 4.5 billion years old, and still the only place we know of that dreams.' },
});

const mars = makePlanet({
  id: 'mars', radius: 18, position: new THREE.Vector3(-140, 30, -520),
  color: 0xb3583a, emissive: 0x3a140a, atmosphere: 0xff8a5c,
  facts: { title: 'The Red World', text: 'Home to Olympus Mons, the largest volcano in the solar system — nearly three times the height of Everest.' },
});

const giant = makePlanet({
  id: 'giant', radius: 60, position: new THREE.Vector3(220, -40, -1000),
  color: 0xd9a15c, emissive: 0x3a2a10, ring: 0x8bd8ff, atmosphere: 0xffd58a,
  facts: { title: 'The Giant', text: 'A world with no solid surface — just endless bands of storm, some larger than entire planets, raging for centuries.' },
});

const moon = makePlanet({
  id: 'moon', radius: 10, position: new THREE.Vector3(310, 60, -960),
  color: 0xcfd8e6, emissive: 0x111827,
  facts: { title: 'A Quiet Moon', text: 'Frozen and silent, it has watched the giant spin for longer than life has existed on Earth.' },
});

/* ---------------- Nebula (particle cloud) ---------------- */
function makeNebula(center, spread, count, colors) {
  const positions = new Float32Array(count * 3);
  const colorArr = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const c = colors.map((hex) => new THREE.Color(hex));
  for (let i = 0; i < count; i++) {
    positions[i * 3] = center.x + (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = center.y + (Math.random() - 0.5) * spread * 0.6;
    positions[i * 3 + 2] = center.z + (Math.random() - 0.5) * spread;
    const col = c[Math.floor(Math.random() * c.length)];
    colorArr[i * 3] = col.r;
    colorArr[i * 3 + 1] = col.g;
    colorArr[i * 3 + 2] = col.b;
    sizes[i] = 8 + Math.random() * 14;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
  const mat = new THREE.PointsMaterial({
    size: 10, map: glowTex, transparent: true, opacity: 0.6, vertexColors: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}

const nebula = makeNebula(
  new THREE.Vector3(-80, 0, -1500), 700, 3200,
  [0xb98bff, 0x7dd8ff, 0xff9ecf, 0x6f5bff]
);
scene.add(nebula);

/* ---------------- Black hole (signature moment + lensing distortion) ---------------- */
const blackHolePosition = new THREE.Vector3(20, 0, -1780);

const eventHorizonGeo = new THREE.SphereGeometry(38, 64, 64);
const eventHorizonMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
const eventHorizon = new THREE.Mesh(eventHorizonGeo, eventHorizonMat);
eventHorizon.position.copy(blackHolePosition);
scene.add(eventHorizon);

// A thin, bright accretion disk made of an additive ring texture
const diskGeo = new THREE.RingGeometry(42, 78, 128, 1);
const diskMat = new THREE.MeshBasicMaterial({
  color: 0xffb877, side: THREE.DoubleSide, transparent: true, opacity: 0.42,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
const disk = new THREE.Mesh(diskGeo, diskMat);
disk.position.copy(blackHolePosition);
disk.rotation.x = Math.PI / 2.15;
scene.add(disk);

const diskGlowLight = new THREE.PointLight(0xffb37a, 1.4, 500);
diskGlowLight.position.copy(blackHolePosition);
scene.add(diskGlowLight);

clickable.push(Object.assign(eventHorizon, {
  userData: { id: 'blackhole', facts: { title: 'The Singularity', text: 'Where gravity wins completely. Light itself cannot escape — everything we know about physics simply... stops.' } },
}));

/* ---------------- Comets (randomly spawned shooting stars) ---------------- */
const comets = [];
function spawnComet() {
  const trailLength = 60 + Math.random() * 60;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array([0, 0, 0, -trailLength, 0, 0]);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
  const line = new THREE.Line(geo, mat);

  const startX = -600 + Math.random() * 1200;
  const startY = 200 + Math.random() * 300;
  const startZ = -400 - Math.random() * 1200;
  line.position.set(startX, startY, startZ);

  const dir = new THREE.Vector3(-1 - Math.random(), -0.6 - Math.random() * 0.4, Math.random() * 0.4 - 0.2).normalize();
  line.lookAt(line.position.clone().add(dir));

  scene.add(line);
  comets.push({ mesh: line, dir, speed: 500 + Math.random() * 300, life: 0, maxLife: 1.4 + Math.random() * 0.6 });
}
let cometTimer = 0;
let nextCometAt = 2 + Math.random() * 3;

/* ---------------- Camera path (keyframes) ---------------- */
const keyframes = [
  { t: 0.00, pos: new THREE.Vector3(0, 10, 260), look: new THREE.Vector3(0, 0, 0) },
  { t: 0.15, pos: new THREE.Vector3(30, -5, 0), look: earth.mesh.position },
  { t: 0.32, pos: new THREE.Vector3(-90, 20, -420), look: mars.mesh.position },
  { t: 0.50, pos: new THREE.Vector3(140, 0, -880), look: giant.mesh.position },
  { t: 0.68, pos: new THREE.Vector3(-40, 30, -1420), look: new THREE.Vector3(-80, 0, -1500) },
  { t: 0.85, pos: new THREE.Vector3(90, 55, -1600), look: blackHolePosition },
  { t: 1.00, pos: new THREE.Vector3(20, 0, -2040), look: new THREE.Vector3(0, 0, -2100) },
];

const posPoints = keyframes.map((k) => k.pos);
const lookPoints = keyframes.map((k) => (k.look.isVector3 ? k.look.clone() : k.look));
const posCurve = new THREE.CatmullRomCurve3(posPoints, false, 'catmullrom', 0.5);
const lookCurve = new THREE.CatmullRomCurve3(lookPoints, false, 'catmullrom', 0.5);

function cameraForProgress(t) {
  const clamped = Math.min(Math.max(t, 0), 1);
  const pos = posCurve.getPoint(clamped);
  const look = lookCurve.getPoint(clamped);
  return { pos, look };
}

/* ---------------- Portal (final destination) ---------------- */
const portalGroup = new THREE.Group();
const portalGeo = new THREE.TorusGeometry(70, 6, 32, 128);
const portalMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, emissive: 0x7dd8ff, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.6,
});
const portalRing = new THREE.Mesh(portalGeo, portalMat);
portalGroup.add(portalRing);

const portalCoreGeo = new THREE.CircleGeometry(58, 64);
const portalCoreMat = new THREE.MeshBasicMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.8 });
const portalCore = new THREE.Mesh(portalCoreGeo, portalCoreMat);
portalGroup.add(portalCore);

portalGroup.position.set(0, 0, -2200);
scene.add(portalGroup);

const portalLight = new THREE.PointLight(0x9fd8ff, 1.6, 700);
portalLight.position.copy(portalGroup.position);
scene.add(portalLight);

/* ---------------- Gravitational lensing post-processing pass ---------------- */
const LensingShader = {
  uniforms: {
    tDiffuse: { value: null },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uCenter;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      vec2 toCenter = vUv - uCenter;
      float dist = length(toCenter);
      float radius = 0.42;
      float effect = uStrength * smoothstep(radius, 0.0, dist);
      float angle = effect * 2.4;
      float s = sin(angle);
      float c = cos(angle);
      vec2 rotated = vec2(c * toCenter.x - s * toCenter.y, s * toCenter.x + c * toCenter.y);
      vec2 pulled = rotated * (1.0 - effect * 0.85);
      vec2 newUv = uCenter + pulled;
      gl_FragColor = texture2D(tDiffuse, newUv);
    }
  `,
};
const lensingPass = new ShaderPass(LensingShader);

/* ---------------- Post-processing ---------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.65, 0.55, 0.35
);
composer.addPass(bloomPass);
composer.addPass(lensingPass);
composer.addPass(new OutputPass());

/* ---------------- Scroll progress ---------------- */
let targetProgress = 0;
let smoothProgress = 0;

function updateScrollProgress() {
  const doc = document.documentElement;
  const scrollTop = doc.scrollTop || document.body.scrollTop;
  const scrollHeight = doc.scrollHeight - doc.clientHeight;
  targetProgress = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
  document.getElementById('progress-fill').style.width = `${targetProgress * 100}%`;
}
window.addEventListener('scroll', updateScrollProgress, { passive: true });
updateScrollProgress();

/* ---------------- Reveal panels on scroll ---------------- */
const panels = document.querySelectorAll('.panel-inner');
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  },
  { threshold: 0.35 }
);
panels.forEach((p) => revealObserver.observe(p));

/* ---------------- Mouse / touch tracking (parallax + raycasting) ---------------- */
let mouseX = 0, mouseY = 0;
let smoothMouseX = 0, smoothMouseY = 0;
const mouseNDC = new THREE.Vector2(-10, -10);
const raycaster = new THREE.Raycaster();

function setMouseFromClient(clientX, clientY) {
  mouseX = (clientX / window.innerWidth - 0.5) * 2;
  mouseY = (clientY / window.innerHeight - 0.5) * 2;
  mouseNDC.set(mouseX, -mouseY);
}
window.addEventListener('mousemove', (e) => setMouseFromClient(e.clientX, e.clientY));
window.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (t) setMouseFromClient(t.clientX, t.clientY);
}, { passive: true });

/* ---------------- Custom glowing cursor ---------------- */
const cursorEl = document.createElement('div');
cursorEl.id = 'custom-cursor';
document.body.appendChild(cursorEl);
let cursorX = window.innerWidth / 2, cursorY = window.innerHeight / 2;
let cursorTX = cursorX, cursorTY = cursorY;
window.addEventListener('mousemove', (e) => { cursorTX = e.clientX; cursorTY = e.clientY; });

/* ---------------- Click-to-explore info panel ---------------- */
const infoPanel = document.createElement('div');
infoPanel.id = 'info-panel';
infoPanel.innerHTML = `
  <div id="info-panel-inner">
    <span id="info-panel-close">✕</span>
    <span id="info-panel-title"></span>
    <p id="info-panel-text"></p>
  </div>
`;
document.body.appendChild(infoPanel);
const infoTitleEl = document.getElementById('info-panel-title');
const infoTextEl = document.getElementById('info-panel-text');
document.getElementById('info-panel-close').addEventListener('click', () => infoPanel.classList.remove('open'));

let hovered = null;
function updateHover() {
  raycaster.setFromCamera(mouseNDC, camera);
  const intersects = raycaster.intersectObjects(clickable, false);
  const hit = intersects.length ? intersects[0].object : null;
  if (hit !== hovered) {
    if (hovered) cursorEl.classList.remove('hover');
    hovered = hit;
    if (hovered) cursorEl.classList.add('hover');
  }
}
canvas.addEventListener('click', () => {
  if (!hovered) return;
  const facts = hovered.userData.facts;
  if (!facts) return;
  infoTitleEl.textContent = facts.title;
  infoTextEl.textContent = facts.text;
  infoPanel.classList.add('open');
});

/* ---------------- Resize ---------------- */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- Ambient sound (optional, generated tone, no external files) ---------------- */
let audioCtx, droneGain, started = false;
const soundBtn = document.getElementById('sound-toggle');
function startAmbientAudio() {
  if (started) return;
  started = true;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  droneGain = audioCtx.createGain();
  droneGain.gain.value = 0;
  droneGain.connect(audioCtx.destination);

  const freqs = [55, 82.4, 110, 164.8];
  freqs.forEach((f, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = i % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.value = f;
    const g = audioCtx.createGain();
    g.gain.value = 0.05 / (i + 1);
    osc.connect(g).connect(droneGain);
    osc.start();
  });
}
let soundOn = false;
soundBtn.addEventListener('click', () => {
  startAmbientAudio();
  soundOn = !soundOn;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  droneGain.gain.linearRampToValueAtTime(soundOn ? 0.5 : 0, audioCtx.currentTime + 0.6);
  soundBtn.textContent = soundOn ? '🔊' : '🔇';
});

/* ============================================================
   FINALE SEQUENCE — hold-to-charge, warp flythrough, confetti burst
   Inspired by Jam3's "FWA 100" (fwa100.jam3.com): a hold-to-charge
   interaction that releases into a camera flight down a vortex with
   FOV elongation for a "warp speed" feel, ending in a confetti burst.
   ============================================================ */

const warpBtn = document.getElementById('warp-hold-btn');
const warpRingFill = document.getElementById('warp-ring-fill');
const finaleOverlay = document.getElementById('finale-overlay');
const finalePanelInner = document.getElementById('finale-panel-inner');
const replayBtn = document.getElementById('replay-btn');
const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // matches the SVG circle r=52

const warpState = { phase: 'idle', chargeStart: 0, warpStart: 0 }; // idle -> charging -> warping -> done
const CHARGE_DURATION = 1.3; // seconds to hold before launch
const WARP_DURATION = 2.6; // seconds for the flythrough itself

/* ---------------- Warp streak particles (radial speed-lines) ---------------- */
const warpStreakCount = 400;
const warpStreakGeo = new THREE.BufferGeometry();
const warpStreakPositions = new Float32Array(warpStreakCount * 3);
const warpStreakSeeds = new Float32Array(warpStreakCount);
for (let i = 0; i < warpStreakCount; i++) {
  const angle = Math.random() * Math.PI * 2;
  const r = 20 + Math.random() * 220;
  warpStreakPositions[i * 3] = Math.cos(angle) * r;
  warpStreakPositions[i * 3 + 1] = Math.sin(angle) * r;
  warpStreakPositions[i * 3 + 2] = -Math.random() * 1200;
  warpStreakSeeds[i] = Math.random();
}
warpStreakGeo.setAttribute('position', new THREE.BufferAttribute(warpStreakPositions, 3));
warpStreakGeo.setAttribute('aSeed', new THREE.BufferAttribute(warpStreakSeeds, 1));
const warpStreakMat = new THREE.ShaderMaterial({
  uniforms: { uOpacity: { value: 0 } },
  vertexShader: `
    attribute float aSeed;
    varying float vSeed;
    void main() {
      vSeed = aSeed;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = 3.0 * (600.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform float uOpacity;
    varying float vSeed;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float d = 1.0 - smoothstep(0.0, 0.5, length(c));
      gl_FragColor = vec4(0.8, 0.92, 1.0, d * uOpacity);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const warpStreaks = new THREE.Points(warpStreakGeo, warpStreakMat);
warpStreaks.visible = false;
scene.add(warpStreaks);

/* ---------------- Confetti burst (instanced tetrahedra) ---------------- */
const CONFETTI_COUNT = 140;
const confettiColors = [0x7dd8ff, 0xb98bff, 0xff9ecf, 0xffe066, 0xffffff];
const confettiGeo = new THREE.TetrahedronGeometry(2.2);
const confettiMat = new THREE.MeshBasicMaterial({ vertexColors: false });
const confettiMesh = new THREE.InstancedMesh(confettiGeo, confettiMat, CONFETTI_COUNT);
confettiMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CONFETTI_COUNT * 3), 3);
confettiMesh.visible = false;
scene.add(confettiMesh);

const confettiState = [];
const confettiDummy = new THREE.Object3D();

function resetConfetti(origin) {
  confettiState.length = 0;
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      Math.random() * 0.6 + 0.2,
      (Math.random() - 0.5) * 2
    ).normalize();
    const speed = 40 + Math.random() * 90;
    confettiState.push({
      pos: origin.clone(),
      vel: dir.multiplyScalar(speed),
      rot: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
      rotSpeed: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
      life: 0,
      maxLife: 2.2 + Math.random() * 1.2,
    });
    const color = new THREE.Color(confettiColors[i % confettiColors.length]);
    confettiMesh.setColorAt(i, color);
  }
  confettiMesh.instanceColor.needsUpdate = true;
}

function updateConfetti(delta) {
  if (!confettiMesh.visible) return;
  let anyAlive = false;
  for (let i = 0; i < confettiState.length; i++) {
    const c = confettiState[i];
    c.life += delta;
    if (c.life < c.maxLife) anyAlive = true;
    c.vel.y -= 30 * delta; // gravity-like pull
    c.pos.addScaledVector(c.vel, delta);
    c.rot.x += c.rotSpeed.x * delta;
    c.rot.y += c.rotSpeed.y * delta;
    c.rot.z += c.rotSpeed.z * delta;
    confettiDummy.position.copy(c.pos);
    confettiDummy.rotation.copy(c.rot);
    const fade = Math.max(0, 1 - c.life / c.maxLife);
    confettiDummy.scale.setScalar(fade);
    confettiDummy.updateMatrix();
    confettiMesh.setMatrixAt(i, confettiDummy.matrix);
  }
  confettiMesh.instanceMatrix.needsUpdate = true;
  if (!anyAlive) confettiMesh.visible = false;
}

/* ---------------- Hold-to-charge input handling ---------------- */
function setCharging(active) {
  if (active) {
    warpState.phase = 'charging';
    warpState.chargeStart = performance.now();
    warpBtn.classList.add('charging');
  } else if (warpState.phase === 'charging') {
    warpState.phase = 'idle';
    warpBtn.classList.remove('charging');
    warpRingFill.style.strokeDashoffset = RING_CIRCUMFERENCE;
  }
}
warpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setCharging(true); });
warpBtn.addEventListener('pointerup', () => setCharging(false));
warpBtn.addEventListener('pointerleave', () => setCharging(false));
warpBtn.addEventListener('pointercancel', () => setCharging(false));

function launchWarp() {
  warpState.phase = 'warping';
  warpState.warpStart = performance.now();
  warpBtn.classList.add('launched');
  warpBtn.classList.remove('charging');
  warpStreaks.visible = true;
  document.body.classList.add('warping');
  window.removeEventListener('scroll', updateScrollProgress);
}

replayBtn.addEventListener('click', () => {
  finaleOverlay.classList.remove('show');
  confettiMesh.visible = false;
  warpStreaks.visible = false;
  warpBtn.classList.remove('launched');
  warpRingFill.style.strokeDashoffset = RING_CIRCUMFERENCE;
  warpState.phase = 'idle';
  document.body.classList.remove('warping');
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  camera.fov = 60;
  camera.updateProjectionMatrix();
});

/* ---------------- Animation loop ---------------- */
const clock = new THREE.Clock();
const tmpVec = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  const delta = clock.getDelta();

  starLayers.forEach((s) => { s.material.uniforms.uTime.value = elapsed; });

  smoothMouseX += (mouseX - smoothMouseX) * 0.04;
  smoothMouseY += (mouseY - smoothMouseY) * 0.04;

  /* ---- Hold-to-charge -> warp -> finale state machine ---- */
  if (warpState.phase === 'charging') {
    const chargeT = Math.min(1, (performance.now() - warpState.chargeStart) / (CHARGE_DURATION * 1000));
    warpRingFill.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - chargeT));
    if (chargeT >= 1) launchWarp();
  }

  if (warpState.phase === 'warping') {
    const warpT = Math.min(1, (performance.now() - warpState.warpStart) / (WARP_DURATION * 1000));
    const eased = warpT * warpT * (3 - 2 * warpT); // smoothstep easing

    // Fly straight down the -Z axis toward/through the portal, FOV stretching for a warp-speed feel.
    const startPos = posCurve.getPoint(1);
    const endPos = new THREE.Vector3(0, 0, portalGroup.position.z - 260);
    camera.position.lerpVectors(startPos, endPos, eased);
    camera.lookAt(0, 0, portalGroup.position.z - 400);
    camera.fov = 60 + eased * 55;
    camera.updateProjectionMatrix();

    warpStreakMat.uniforms.uOpacity.value = Math.sin(Math.min(1, warpT * 2.5) * Math.PI * 0.5);
    warpStreaks.position.z = camera.position.z - 40;
    bloomPass.strength = 0.6 + eased * 0.7;

    if (warpT >= 1 && warpState.phase !== 'done') {
      warpState.phase = 'done';
      warpStreaks.visible = false;
      confettiMesh.visible = true;
      resetConfetti(new THREE.Vector3(0, 0, camera.position.z - 60));
      finaleOverlay.classList.add('show');
    }
  } else if (warpState.phase === 'done') {
    // Warp has finished: hold the camera steady looking at the confetti burst,
    // don't let normal scroll-driven camera logic take back over.
    camera.lookAt(0, 0, portalGroup.position.z - 400);
  } else {
    smoothProgress += (targetProgress - smoothProgress) * 0.06;
    const { pos, look } = cameraForProgress(smoothProgress);
    camera.position.copy(pos);
    camera.position.x += smoothMouseX * 14;
    camera.position.y += -smoothMouseY * 10;
    camera.lookAt(look);
  }

  updateConfetti(delta);

  // Gentle idle rotation
  earth.mesh.rotation.y = elapsed * 0.08;
  mars.mesh.rotation.y = elapsed * 0.06;
  giant.group.rotation.y = elapsed * 0.03;
  moon.mesh.rotation.y = elapsed * 0.1;
  portalGroup.rotation.z = elapsed * 0.15;
  portalCore.material.opacity = 0.75 + Math.sin(elapsed * 2) * 0.15;
  nebula.rotation.y = elapsed * 0.01;
  disk.rotation.z = elapsed * 0.25;
  eventHorizon.rotation.y = elapsed * 0.05;

  if (warpState.phase !== 'warping') {
    bloomPass.strength = 0.6 + Math.sin(elapsed * 0.5) * 0.1;
  }

  // Hover state for click-to-explore
  updateHover();
  canvas.style.cursor = hovered ? 'none' : 'none';

  // Custom cursor follow
  cursorX += (cursorTX - cursorX) * 0.2;
  cursorY += (cursorTY - cursorY) * 0.2;
  cursorEl.style.transform = `translate(${cursorX}px, ${cursorY}px)`;

  // Gravitational lensing: ramp strength when near the black-hole chapter (t ~= 0.85)
  const blackHoleDist = Math.abs(smoothProgress - 0.85);
  const lensStrength = Math.max(0, 1 - blackHoleDist / 0.08);
  tmpVec.copy(blackHolePosition).project(camera);
  lensingPass.uniforms.uCenter.value.set((tmpVec.x + 1) / 2, (tmpVec.y + 1) / 2);
  lensingPass.uniforms.uStrength.value = lensStrength * 0.5;
  diskGlowLight.intensity = 1.2 + lensStrength * 1.6;

  // Comets
  cometTimer += delta;
  if (cometTimer > nextCometAt) {
    cometTimer = 0;
    nextCometAt = 2.5 + Math.random() * 4;
    spawnComet();
  }
  for (let i = comets.length - 1; i >= 0; i--) {
    const c = comets[i];
    c.life += delta;
    c.mesh.position.addScaledVector(c.dir, c.speed * delta);
    c.mesh.material.opacity = Math.max(0, 0.9 * (1 - c.life / c.maxLife));
    if (c.life >= c.maxLife) {
      scene.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mesh.material.dispose();
      comets.splice(i, 1);
    }
  }

  composer.render();
}

// Kick off the loading screen, then start rendering
window.addEventListener('load', () => {
  setTimeout(() => {
    document.getElementById('loader').classList.add('hidden');
  }, 900);
});

animate();
