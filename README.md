# WebGPU Glass Caustics Path Tracer

A physically-based real-time path tracer that renders glass sphere caustics using WebGPU compute shaders and WGSL.

![screenshot](screenshot.png)

## Live Demo

**[https://iscg-caustics.vercel.app/](https://iscg-caustics.vercel.app/)**

> Requires Chrome 113 or later with WebGPU support.

## Features

- **Unidirectional path tracing** — up to 8 bounces per path with Russian roulette termination after bounce 3
- **Glass sphere** — full dielectric BRDF: Snell's law refraction, total internal reflection (TIR), and Schlick Fresnel
- **Caustics** — focused light patterns converge progressively beneath the sphere via temporal accumulation
- **Chromatic dispersion** — separate R/G/B rays with per-channel IOR offsets produce rainbow fringes in the caustic
- **Beer–Lambert absorption** — exponential attenuation inside the glass volume for tinted glass
- **Ping-pong temporal accumulation** — two `rgba32float` storage textures alternate each frame; accumulation resets on any interaction
- **ACES filmic tone mapping** + gamma correction in the display pass fragment shader
- **Blender-style camera controls** — middle-drag orbit, Shift + middle-drag pan, scroll zoom
- **Tweakpane GUI** — runtime sliders for light position (X/Y/Z) and dispersion strength

## Tech Stack

| Layer | Technology |
|---|---|
| GPU API | WebGPU (Chrome 113+) |
| Shader language | WGSL (compute + fragment) |
| Host language | TypeScript |
| Bundler | Vite |
| GUI | Tweakpane v4 |
| Package / env manager | Nix (flake) |

## Getting Started

### Prerequisites

- [Nix](https://nixos.org/download/) with flakes enabled
- Chrome 113 or later

### Installation

```bash
git clone https://github.com/<your-username>/iscg-caustics.git
cd iscg-caustics
nix develop
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in Chrome.

## Controls

| Gesture | Action |
|---|---|
| Middle-drag | Orbit camera |
| Shift + Middle-drag | Pan look-at target |
| Scroll | Zoom in / out |
| Tweakpane → Light Position | Move the area light (X / Y / Z sliders) |
| Tweakpane → Glass → Dispersion | Adjust chromatic dispersion strength (0 – 0.05) |

## Project Structure

```
.
├── flake.nix               # Nix dev shell
├── index.html              # HTML entry point + CSS overlay
└── src/
    ├── main.ts             # WebGPU init, render loop, mouse controls
    ├── renderer/
    │   ├── pathtracer.ts   # Pipeline setup, ping-pong accumulation
    │   └── shaders/
    │       ├── pathtrace.wgsl   # Compute shader: path tracing, BRDFs
    │       └── display.wgsl     # Fragment shader: tone mapping, gamma
    ├── scene/
    │   └── scene.ts        # Scene params, uniform buffer layout
    └── ui/
        └── controls.ts     # Tweakpane bindings
```

## License

MIT