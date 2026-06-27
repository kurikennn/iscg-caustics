export interface SceneParams {
  // Camera
  cameraPos: [number, number, number];
  cameraTarget: [number, number, number];
  fov: number;

  // Sphere
  sphereCenter: [number, number, number];
  sphereRadius: number;
  sphereIOR: number;

  // Light
  lightPos: [number, number, number];
  lightRadius: number;
  lightColor: [number, number, number];
  lightIntensity: number;

  // Material
  groundAlbedo: [number, number, number];
  absorption: number;
  dispersion: number;
}

export const defaultScene: SceneParams = {
  cameraPos: [0, 2, 6],
  cameraTarget: [0, 0, 0],
  fov: 45,

  sphereCenter: [0, 1, 0],
  sphereRadius: 1.0,
  sphereIOR: 1.5,

  lightPos: [0, 4, 0],
  lightRadius: 0.8,
  lightColor: [1, 1, 1],
  lightIntensity: 8.0,

  groundAlbedo: [0.8, 0.8, 0.8],
  absorption: 0.05,
  dispersion: 0.012,
};

// Uniform buffer layout — derived from WGSL struct member alignment rules.
// vec3<f32> has AlignOf=16 / SizeOf=12, so the compiler inserts implicit padding:
//   - 8 bytes between dispersion (ends @72) and _pad1 (AlignOf=16 → starts @80)
//   - 4 bytes between _pad1 (ends @92) and lightPos (AlignOf=16 → starts @96)
//
// Float index → byte offset → field
//  [0..2]   0  cameraPos      vec3
//  [3]     12  frameCount     u32
//  [4..6]  16  cameraTarget   vec3
//  [7]     28  fov            f32
//  [8..9]  32  canvasSize     vec2
//  [10..11] 40  _pad0         vec2
//  [12..14] 48  sphereCenter  vec3
//  [15]    60  sphereRadius   f32
//  [16]    64  sphereIOR      f32
//  [17]    68  dispersion     f32  ← slots into first 4 bytes of former implicit pad
//  [18..19] 72  (implicit pad — WGSL aligns _pad1 to 80)
//  [20..22] 80  _pad1         vec3
//  [23]    92  (implicit pad — WGSL aligns lightPos to 96)
//  [24..26] 96  lightPos      vec3
//  [27]   108  lightRadius    f32
//  [28..30] 112  lightColor   vec3
//  [31]   124  lightIntensity f32
//  [32..34] 128  groundAlbedo vec3
//  [35]   140  absorption     f32
// Total: 36 floats = 144 bytes (unchanged)
export const UNIFORM_BUFFER_SIZE = 144;

export function writeUniforms(
  buffer: Float32Array,
  uintView: Uint32Array,
  scene: SceneParams,
  frameCount: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  buffer[0] = scene.cameraPos[0];
  buffer[1] = scene.cameraPos[1];
  buffer[2] = scene.cameraPos[2];
  uintView[3] = frameCount;
  buffer[4] = scene.cameraTarget[0];
  buffer[5] = scene.cameraTarget[1];
  buffer[6] = scene.cameraTarget[2];
  buffer[7] = scene.fov;
  buffer[8] = canvasWidth;
  buffer[9] = canvasHeight;
  buffer[10] = 0;
  buffer[11] = 0;
  buffer[12] = scene.sphereCenter[0];
  buffer[13] = scene.sphereCenter[1];
  buffer[14] = scene.sphereCenter[2];
  buffer[15] = scene.sphereRadius;
  buffer[16] = scene.sphereIOR;
  buffer[17] = scene.dispersion;
  // [18..19]: implicit WGSL padding (offsets 72–76) — leave as zero
  // [20..22]: _pad1 vec3 (offset 80) — leave as zero
  // [23]: implicit WGSL padding (offset 92) — leave as zero
  buffer[24] = scene.lightPos[0];
  buffer[25] = scene.lightPos[1];
  buffer[26] = scene.lightPos[2];
  buffer[27] = scene.lightRadius;
  buffer[28] = scene.lightColor[0];
  buffer[29] = scene.lightColor[1];
  buffer[30] = scene.lightColor[2];
  buffer[31] = scene.lightIntensity;
  buffer[32] = scene.groundAlbedo[0];
  buffer[33] = scene.groundAlbedo[1];
  buffer[34] = scene.groundAlbedo[2];
  buffer[35] = scene.absorption;
}
