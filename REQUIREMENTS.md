# WebGPU Path Tracer with Glass Sphere Caustics — Requirements

## Project Overview

A physically-based real-time path tracer implemented in WebGPU (WGSL compute shaders) that renders glass sphere caustics. The renderer accumulates samples across frames (temporal accumulation) to progressively converge toward a noise-free image. The scene is interactive: the camera, objects, and light source can be manipulated via mouse input.

---

## Tech Stack

| Layer | Technology |
|---|---|
| GPU API | WebGPU (Chrome 113+) |
| Shader language | WGSL |
| Host language | TypeScript |
| Bundler | Vite |
| Package / env manager | Nix (flake) |
| UI controls | Tweakpane v4 |

---

## Repository Structure

```
project/
├── flake.nix               # Nix dev shell (Node.js, TypeScript)
├── flake.lock
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.ts             # Entry point: WebGPU init, render loop
    ├── renderer/
    │   ├── pathtracer.ts   # Pipeline setup, dispatch, accumulation
    │   └── shaders/
    │       ├── pathtrace.wgsl   # Compute shader: ray generation, BRDFs
    │       └── display.wgsl     # Fragment shader: tone mapping, gamma
    ├── scene/
    │   └── scene.ts        # Scene description, uniform buffer layout
    └── ui/
        └── controls.ts     # Mouse / GUI interaction → uniform updates
```

---

## Phase 1 — Core Path Tracer (Initial Implementation)

This phase establishes the minimal working renderer. All subsequent phases build on top of it.

### 1.1 WebGPU Bootstrap

- Request a `GPUAdapter` and `GPUDevice`; display a user-friendly error if WebGPU is unavailable.
- Create a `GPUCanvasContext` configured with `bgra8unorm` format.
- Allocate two storage textures (`rgba32float`) for ping-pong temporal accumulation.
- Allocate a uniform buffer (`CameraUniforms`) updated every frame.

### 1.2 Compute Shader — Ray Generation

Each invocation handles one pixel `(x, y)`.

- Reconstruct a camera ray from pixel coordinates, canvas size, camera position, look-at target, and vertical FOV.
- Apply a sub-pixel jitter (uniform random offset within the pixel) to enable anti-aliasing through accumulation.
- Pass the ray to the path tracing loop.

### 1.3 Compute Shader — Scene Intersection

Intersect the ray against the following primitives (Phase 1 scope):

| Primitive | Method |
|---|---|
| Infinite ground plane (`y = 0`) | Analytical |
| Sphere (glass ball, radius configurable) | Analytical |

Return the closest hit: position, geometric normal, front-face flag, and material ID.

### 1.4 Compute Shader — Material & Path Tracing Loop

Implement a **unidirectional path tracer** with a fixed maximum bounce depth (default: 8).

#### Diffuse (Lambertian)
- Sample the next direction with cosine-weighted hemisphere sampling.
- Multiply throughput by `albedo`.

#### Dielectric (glass sphere)
Implement the full physical glass model:

1. **Snell's Law** — compute the refracted ray direction given the index of refraction (IOR, default 1.5).
2. **Total Internal Reflection (TIR)** — if the discriminant is negative, force a perfect specular reflection.
3. **Schlick's approximation** — probabilistically choose reflection vs. refraction based on the Fresnel reflectance at the current angle.
4. **Beer–Lambert Law** — attenuate the throughput by `exp(-absorption * distance)` for rays traveling inside the glass volume, enabling tinted glass.

#### Emissive (area light)
- If a ray hits the light geometry (a quad or disk above the scene), add `emission * throughput` to the pixel color and terminate the path.

#### Russian Roulette path termination
- After a minimum of 3 bounces, terminate paths probabilistically based on the maximum throughput component. Rescale surviving paths to keep the estimator unbiased.

### 1.5 Temporal Accumulation

- On each frame, blend the new sample into the accumulation texture:
  ```
  accumulated = (accumulated * frameCount + newSample) / (frameCount + 1)
  ```
- Reset `frameCount` to 0 whenever the camera or scene parameters change.

### 1.6 Display Pass

A full-screen quad fragment shader reads the accumulation texture and applies:

- **ACES filmic tone mapping** — maps HDR values to [0, 1].
- **Gamma correction** — converts linear light to sRGB (`pow(color, 1/2.2)`).

### 1.7 Mouse Interaction

| Gesture | Action |
|---|---|
| Left-drag | Orbit camera around look-at target (azimuth / elevation) |
| Right-drag | Pan look-at target |
| Scroll | Dolly (zoom) |
| Shift + left-drag | Move the point light source in the XZ plane |

Any interaction resets the accumulation buffer.

---

## Phase 2 — Caustics Quality & Visual Polish (Future)

_Out of scope for Phase 1. Listed for planning purposes._

- Dispersion: split white light into R/G/B rays with per-channel IOR offsets to produce rainbow caustics.
- Multiple glass spheres with different IOR and absorption colors.
- Importance sampling of the area light (next-event estimation) to reduce caustic noise.
- Denoising pass (spatial bilateral filter) to allow interactive frame rates at low sample counts.

---

## Uniform Buffer Layout

```wgsl
struct CameraUniforms {
    // Camera
    cameraPos    : vec3<f32>,
    frameCount   : u32,
    cameraTarget : vec3<f32>,
    fov          : f32,
    canvasSize   : vec2<f32>,
    _pad0        : vec2<f32>,

    // Scene
    sphereCenter : vec3<f32>,
    sphereRadius : f32,
    sphereIOR    : f32,
    _pad1        : vec3<f32>,

    // Light
    lightPos     : vec3<f32>,
    lightRadius  : f32,
    lightColor   : vec3<f32>,
    lightIntensity : f32,

    // Material
    groundAlbedo : vec3<f32>,
    absorption   : f32,
}
```

---

## Acceptance Criteria (Phase 1)

- [ ] A glass sphere is visible on a diffuse ground plane, lit by an area light.
- [ ] Caustics (bright focused light pattern) appear on the ground beneath the glass sphere and converge as frames accumulate.
- [ ] Fresnel effect is visible: the sphere becomes more mirror-like at grazing angles.
- [ ] Beer–Lambert tinting is visible when `absorption > 0`.
- [ ] Camera orbits smoothly with left-drag; accumulation resets on interaction.
- [ ] Light source moves with Shift + left-drag; accumulation resets accordingly.
- [ ] Runs at ≥ 1 sample/frame (interactive) on a discrete GPU in Chrome.
- [ ] No WebGPU validation errors in the browser console.

---

## Nix Dev Shell (`flake.nix` — minimal)

```nix
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }: let
    system = "x86_64-linux";
    pkgs = nixpkgs.legacyPackages.${system};
  in {
    devShells.${system}.default = pkgs.mkShell {
      packages = [ pkgs.nodejs_20 pkgs.nodePackages.typescript ];
    };
  };
}
```

Run with:
```bash
nix develop
npm install
npm run dev
```
