# WebGPU Glass Caustics Path Tracer

A physically-based real-time path tracer that renders glass sphere caustics using WebGPU compute shaders.

![screenshot](docs/screenshot.png)

## Features

- **Unidirectional path tracing** — up to 8 bounces per path, Russian roulette termination after bounce 3
- **Glass sphere** — full dielectric BRDF with Snell's law refraction, total internal reflection, and Schlick Fresnel
- **Caustics** — focused light patterns beneath the glass sphere converge via temporal accumulation
- **Beer–Lambert absorption** — tinted glass via exponential attenuation inside the volume
- **Temporal accumulation** — progressive refinement; sample count shown in the top-left corner
- **ACES filmic tone mapping** + gamma correction in the display pass
- **Mouse orbit, zoom, and light control** — interactive camera with accumulation reset on every interaction

## Tech Stack

| Layer | Technology |
|---|---|
| GPU API | WebGPU (Chrome 113+) |
| Shader language | WGSL |
| Host language | TypeScript |
| Bundler | Vite |
| Package / env manager | Nix (flake) |

## Getting Started

```bash
nix develop
npm install
npm run dev
```

Then open **Chrome 113+** and navigate to `http://localhost:5173`.

## Controls

| Gesture | Action |
|---|---|
| Left-drag | Orbit camera around scene |
| Scroll | Zoom in / out |
| Right-drag | Pan look-at target |
| Shift + Left-drag | Move the area light in the XZ plane |

## Browser Requirement

WebGPU is required. Use **Chrome 113 or later**. If you see an error message, make sure WebGPU is enabled (`chrome://flags/#enable-unsafe-webgpu` on older builds).
