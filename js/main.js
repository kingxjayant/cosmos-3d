import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ============================================================
   COSMOS — a scroll-driven 3D journey through space
   Built for the 3D Websites Hackathon.

   Structure:
   - A single Three.js scene containing a starfield, several
     planets, a particle nebula, and a glowing "portal" at the end.
   - The camera follows a hand-authored path (an array of keyframe
     positions/targets). Scroll progress (0..1) interpolates smoothly
     between keyframes using catmull-rom splines, so scrolling feels
     like flying a slow, cinematic camera through space.
   - Bloom post-processing gives the glowing sci-fi look.
   ============================================================ */

const canvas = document.getElementById('bg');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060c, 0.0018);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);

/* ---------------- Lighting ---------------- */
scene.add(new THREE.AmbientLight(0x404060, 1.2));
const sunLight = new THREE.PointLight(0xfff2d0, 3, 0, 0);
sunLight.position.set(-400, 80, -600);
scene.add(sunLight);

const rimLight = new THREE.PointLight(0x7dd8ff, 2, 0, 0);
rimLight.position.set(300, -100, 200);
scene.add(rimLight);

/* ---------------- Starfield ---------------- */
function makeStarfield(count, radius, size, color) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = radius * (0.4 + Math.random() * 0.6);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color, size, sizeAttenuation: true, transparent: true, opacity: 0.9,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

scene.add(makeStarfield(6000, 2200, 1.6, 0xffffff));
scene.add(makeStarfield(2500, 1400, 2.6, 0x9fd8ff));
scene.add(makeStarfield(900, 900, 4, 0xffe3c2));

/* ---------------- Planets ---------------- */
function makePlanet({ radius, position, color, emissive = 0x000000, ring = false, roughness = 0.85 }) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(radius, 48, 48);
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.15, emissive, emissiveIntensity: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(position);
  group.add(mesh);

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

// Earth-like (near the start)
const earth = makePlanet({
  radius: 26, position: new THREE.Vector3(60, -20, -80),
  color: 0x2f6fb0, emissive: 0x0a1f33,
});

// Mars-like (section 2)
const mars = makePlanet({
  radius: 18, position: new THREE.Vector3(-140, 30, -520),
  color: 0xb3583a, emissive: 0x3a140a,
});

// Gas giant with ring (section 3)
const giant = makePlanet({
  radius: 60, position: new THREE.Vector3(220, -40, -1000),
  color: 0xd9a15c, emissive: 0x3a2a10, ring: 0x8bd8ff,
});

// Distant icy moon
const moon = makePlanet({
  radius: 10, position: new THREE.Vector3(310, 60, -960),
  color: 0xcfd8e6, emissive: 0x111827,
});

/* ---------------- Nebula (particle cloud) ---------------- */
function makeNebula(center, spread, count, colors) {
  const positions = new Float32Array(count * 3);
  const colorArr = new Float32Array(count * 3);
  const c = colors.map((hex) => new THREE.Color(hex));
  for (let i = 0; i < count; i++) {
    positions[i * 3] = center.x + (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = center.y + (Math.random() - 0.5) * spread * 0.6;
    positions[i * 3 + 2] = center.z + (Math.random() - 0.5) * spread;
    const col = c[Math.floor(Math.random() * c.length)];
    colorArr[i * 3] = col.r;
    colorArr[i * 3 + 1] = col.g;
    colorArr[i * 3 + 2] = col.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
  const mat = new THREE.PointsMaterial({
    size: 7, transparent: true, opacity: 0.55, vertexColors: true,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

const nebula = makeNebula(
  new THREE.Vector3(-80, 0, -1500), 700, 3200,
  [0xb98bff, 0x7dd8ff, 0xff9ecf, 0x6f5bff]
);
scene.add(nebula);

/* ---------------- Portal (final destination) ---------------- */
const portalGroup = new THREE.Group();
const portalGeo = new THREE.TorusGeometry(70, 6, 32, 128);
const portalMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, emissive: 0x7dd8ff, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.6,
});
const portalRing = new THREE.Mesh(portalGeo, portalMat);
portalGroup.add(portalRing);

const portalCoreGeo = new THREE.CircleGeometry(64, 64);
const portalCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
const portalCore = new THREE.Mesh(portalCoreGeo, portalCoreMat);
portalGroup.add(portalCore);

portalGroup.position.set(0, 0, -2000);
scene.add(portalGroup);

const portalLight = new THREE.PointLight(0x9fd8ff, 4, 900);
portalLight.position.copy(portalGroup.position);
scene.add(portalLight);

/* ---------------- Camera path (keyframes) ---------------- */
// Each keyframe: camera position + look-at target, at scroll progress t (0..1)
const keyframes = [
  { t: 0.00, pos: new THREE.Vector3(0, 10, 260), look: new THREE.Vector3(0, 0, 0) },
  { t: 0.18, pos: new THREE.Vector3(30, -5, 0), look: earth.mesh.position },
  { t: 0.38, pos: new THREE.Vector3(-90, 20, -420), look: mars.mesh.position },
  { t: 0.58, pos: new THREE.Vector3(140, 0, -880), look: giant.mesh.position },
  { t: 0.80, pos: new THREE.Vector3(-40, 30, -1420), look: new THREE.Vector3(-80, 0, -1500) },
  { t: 1.00, pos: new THREE.Vector3(0, 0, -1880), look: portalGroup.position },
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

/* ---------------- Post-processing (bloom) ---------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.6, 0.15
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

/* ---------------- Mouse parallax (adds a subtle "looking around" feel) ---------------- */
let mouseX = 0, mouseY = 0;
let smoothMouseX = 0, smoothMouseY = 0;
window.addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
  mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
});
window.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (!t) return;
  mouseX = (t.clientX / window.innerWidth - 0.5) * 2;
  mouseY = (t.clientY / window.innerHeight - 0.5) * 2;
}, { passive: true });

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
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  },
  { threshold: 0.35 }
);
panels.forEach((p) => observer.observe(p));

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

/* ---------------- Animation loop ---------------- */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  // Smooth-follow the real scroll progress (adds a nice cinematic lag)
  smoothProgress += (targetProgress - smoothProgress) * 0.06;

  smoothMouseX += (mouseX - smoothMouseX) * 0.04;
  smoothMouseY += (mouseY - smoothMouseY) * 0.04;

  const { pos, look } = cameraForProgress(smoothProgress);
  camera.position.copy(pos);
  camera.position.x += smoothMouseX * 14;
  camera.position.y += -smoothMouseY * 10;
  camera.lookAt(look);

  // Gentle idle rotation for planets & portal
  earth.mesh.rotation.y = elapsed * 0.08;
  mars.mesh.rotation.y = elapsed * 0.06;
  giant.group.rotation.y = elapsed * 0.03;
  moon.mesh.rotation.y = elapsed * 0.1;
  portalGroup.rotation.z = elapsed * 0.15;
  portalCore.material.opacity = 0.75 + Math.sin(elapsed * 2) * 0.15;
  nebula.rotation.y = elapsed * 0.01;

  bloomPass.strength = 0.9 + Math.sin(elapsed * 0.5) * 0.15;

  composer.render();
}

// Kick off the loading screen, then start rendering
window.addEventListener('load', () => {
  setTimeout(() => {
    document.getElementById('loader').classList.add('hidden');
  }, 900);
});

animate();
