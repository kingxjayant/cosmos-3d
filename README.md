# 🌌 COSMOS — A Journey Through Space

**An immersive, scroll-driven 3D website that takes you on a cinematic flight through space — past Earth, Mars, a ringed gas giant, a glowing nebula, and finally through a portal of light.**

Built for the [3D Websites Hackathon](https://3d-websites-hackathon.devpost.com/).

🔗 **Live demo:** https://kingxjayant.github.io/cosmos-3d/
📦 **Source:** https://github.com/kingxjayant/cosmos-3d

---

## What it is

There's no problem being solved here — this hackathon is about creating *wonder*, not utility. COSMOS is a single-page 3D experience: as you scroll, a virtual camera flies along a hand-authored path that keeps zooming out in scale — literally to the edge of the observable universe. Each scroll "chapter" reveals a new part of the journey: departure from Earth, a pass by Mars, an asteroid belt leading to a gas giant, a colorful particle nebula, a black hole bending light around it, a pull-back to see the Milky Way galaxy from outside, further out to the Cosmic Web (the largest structure in existence — galaxy clusters strung along filaments around vast voids), and finally the Cosmic Microwave Background itself — the oldest light that exists, and the literal edge of what humanity can ever observe. It ends with a press-and-hold portal you can warp through, closing with a confetti celebration.

The finale interaction (hold-to-charge → warp flythrough → confetti burst) is directly inspired by [Jam3's "FWA 100"](https://fwa100.jam3.com/) case study — an award-winning WebGL experience Jam3 built to celebrate their 100th FWA win, which used a similar hold-to-charge → vortex flythrough → confetti-burst structure. COSMOS reinterprets that idea for a "flying to the edge of the universe" narrative.

## How it works

- **Three.js** renders the whole scene, at every scale of the observable universe: a multi-layered twinkling starfield (custom vertex/fragment shader so every star pulses independently), several planet meshes (Earth, Mars, a ringed gas giant, a small moon) each wrapped in a Fresnel "atmosphere glow" shader, a 3,200-particle nebula cloud, a black hole with a glowing accretion disk, a 14,000-particle procedural spiral galaxy (four-armed logarithmic spiral, color-graded from a warm core to a cool rim), a "cosmic web" of galaxy-cluster nodes connected by faint filament lines wrapped around implied dark voids, a Cosmic Microwave Background sky-sphere (a canvas-generated mottled noise texture in the classic CMB palette, rendered back-face-in so the camera sits "inside" it), and a glowing torus "portal" at the very end.
- **Scroll = camera position.** Scroll progress (0 → 1) is smoothed and fed into two `CatmullRomCurve3` splines — one for camera position, one for the look-at target — built from a small set of hand-placed keyframes. This turns scrolling into a smooth, cinematic flight path instead of a jump-cut between fixed camera positions.
- **Click-to-explore interactivity.** Planets (and the black hole) are raycast-tested against the mouse every frame; hovering morphs a custom glowing cursor, and clicking opens an info card with a short fact about that body — real interaction, not just passive scrolling.
- **Gravitational lensing.** Near the black-hole chapter, a custom `ShaderPass` warps the screen-space image around the event horizon's projected screen position, growing and shrinking smoothly as you scroll toward and away from it.
- **Randomly spawned comets** streak across the sky on a timer, each with a fading line-trail.
- **Hold-to-charge finale.** At the very end, a circular "HOLD" button (SVG ring that fills as you press) takes over the camera once fully charged: the camera flies straight at the portal while the field of view stretches (60° → 115°) and hundreds of radial streak-particles rush past for a warp-speed feel, finishing in a physics-driven confetti burst (140 instanced tetrahedra with per-particle gravity/rotation/fade) and a "You Made It" overlay with a "Fly Again" reset button.
- **Mouse/touch parallax** subtly offsets the camera based on cursor position, so the scene feels alive even when you're not scrolling.
- **UnrealBloomPass** post-processing (via `EffectComposer`) gives the glowing, sci-fi look to the stars, planet rims, and portal.
- Section text panels fade/slide in via `IntersectionObserver` as they scroll into view; panels use `pointer-events: none` (with `auto` re-enabled only on real links/buttons) so clicks pass through to the 3D scene underneath.
- An optional ambient drone (built from a few `OscillatorNode`s — no external audio files needed) can be toggled on with the speaker button, bottom-right.
- Everything is vanilla HTML/CSS/JS + Three.js loaded via an import map from a CDN — **no build step, no bundler, no npm install needed.** Just open `index.html` (or serve the folder) and it works.

## Tech used

- [Three.js](https://threejs.org/) (r160) — scene, camera, lighting, geometry, particles
- Three.js `addons`: `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass` for bloom post-processing
- Vanilla JavaScript (ES modules, no framework, no build tool)
- Web Audio API for the optional ambient soundscape
- CSS (`Space Grotesk` / `Sora` from Google Fonts) for the overlaid text panels and UI chrome

## Running it locally

No install needed — it's fully static.

```bash
cd cosmos-3d
python3 -m http.server 8000
# then open http://localhost:8000 in a browser
```

(Any static file server works — `npx serve`, VS Code's Live Server, etc. It must be served over HTTP/HTTPS rather than opened as a `file://` URL, since ES module imports require a real origin.)

## Project structure

```
cosmos-3d/
├── index.html          # Page structure: canvas + scroll-driven text sections
├── css/
│   └── style.css        # All visual styling, fonts, panel layout/animations
└── js/
    └── main.js           # All Three.js scene setup, camera path, bloom, audio, interaction
```

## What I'd build next

- Real planet/galaxy textures (procedural noise or actual NASA/ESA imagery) instead of flat colors and canvas-generated noise
- A mini "warp speed" star-streak transition between each chapter (not just the finale)
- More camera keyframes for a longer, more detailed journey, and more cosmic-web filaments/clusters
- A lightweight loading progress bar tied to actual asset loading rather than a fixed timeout
- More clickable "explorable" objects (comets, individual cosmic-web clusters) with their own facts
