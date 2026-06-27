import { SceneParams } from '../scene/scene';

export class CameraControls {
  private scene: SceneParams;
  private onReset: () => void;

  private azimuth   = 0; // degrees
  private elevation = 0; // degrees
  private distance  = 6;

  private middleDown = false;
  private lastX = 0;
  private lastY = 0;

  constructor(canvas: HTMLCanvasElement, scene: SceneParams, onReset: () => void) {
    this.scene   = scene;
    this.onReset = onReset;

    this.syncFromScene();

    canvas.addEventListener('pointerdown',  this.onPointerDown);
    canvas.addEventListener('pointermove',  this.onPointerMove);
    canvas.addEventListener('pointerup',    this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel',        this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu',  e => e.preventDefault());
  }

  private syncFromScene() {
    const dx = this.scene.cameraPos[0] - this.scene.cameraTarget[0];
    const dy = this.scene.cameraPos[1] - this.scene.cameraTarget[1];
    const dz = this.scene.cameraPos[2] - this.scene.cameraTarget[2];
    this.distance  = Math.sqrt(dx*dx + dy*dy + dz*dz);
    this.elevation = Math.asin(dy / this.distance) * 180 / Math.PI;
    this.azimuth   = Math.atan2(dx, dz) * 180 / Math.PI;
    this.updateCamera();
  }

  private updateCamera() {
    const az = this.azimuth   * Math.PI / 180;
    const el = this.elevation * Math.PI / 180;
    const [tx, ty, tz] = this.scene.cameraTarget;

    this.scene.cameraPos = [
      tx + this.distance * Math.cos(el) * Math.sin(az),
      ty + this.distance * Math.sin(el),
      tz + this.distance * Math.cos(el) * Math.cos(az),
    ];
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 1) return; // middle button only
    e.preventDefault();
    this.middleDown = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.middleDown) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (e.shiftKey) {
      // Pan: translate cameraTarget in the camera's local XY plane
      const sensitivity = 0.002 * this.distance;
      const az = this.azimuth   * Math.PI / 180;
      const el = this.elevation * Math.PI / 180;
      // right and up vectors in world space derived from spherical coords
      const right: [number, number, number] = [Math.cos(az), 0, -Math.sin(az)];
      const up: [number, number, number] = [
        -Math.sin(az) * Math.sin(el),
         Math.cos(el),
        -Math.cos(az) * Math.sin(el),
      ];
      this.scene.cameraTarget = [
        this.scene.cameraTarget[0] - dx * sensitivity * right[0] + dy * sensitivity * up[0],
        this.scene.cameraTarget[1] - dx * sensitivity * right[1] + dy * sensitivity * up[1],
        this.scene.cameraTarget[2] - dx * sensitivity * right[2] + dy * sensitivity * up[2],
      ];
    } else {
      // Orbit
      this.azimuth   -= dx * 0.3;
      this.elevation  = Math.max(-80, Math.min(80, this.elevation + dy * 0.3));
    }

    this.updateCamera();
    this.onReset();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.button !== 1) return;
    this.middleDown = false;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.distance = Math.max(0.5, this.distance * (1 + e.deltaY * 0.001));
    this.updateCamera();
    this.onReset();
  };
}
