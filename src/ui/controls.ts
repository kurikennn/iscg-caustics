import { SceneParams } from '../scene/scene';

export class CameraControls {
  private scene: SceneParams;
  private onReset: () => void;

  // Spherical camera coords
  private azimuth   = 0;
  private elevation = 30; // degrees
  private distance  = 5;

  private lastX = 0;
  private lastY = 0;

  constructor(canvas: HTMLCanvasElement, scene: SceneParams, onReset: () => void) {
    this.scene   = scene;
    this.onReset = onReset;

    // Initialise orbit from default cameraPos / target
    this.syncFromScene();

    canvas.addEventListener('mousedown',  this.onMouseDown);
    canvas.addEventListener('mousemove',  this.onMouseMove);
    canvas.addEventListener('wheel',      this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
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
    const az  = this.azimuth   * Math.PI / 180;
    const el  = this.elevation * Math.PI / 180;
    const r   = this.distance;
    const tx  = this.scene.cameraTarget[0];
    const ty  = this.scene.cameraTarget[1];
    const tz  = this.scene.cameraTarget[2];

    this.scene.cameraPos = [
      tx + r * Math.cos(el) * Math.sin(az),
      ty + r * Math.sin(el),
      tz + r * Math.cos(el) * Math.cos(az),
    ];
  }

  private onMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (e.buttons === 0) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    const leftBtn  = (e.buttons & 1) !== 0;
    const rightBtn = (e.buttons & 2) !== 0;
    const shift    = e.shiftKey;

    if (leftBtn && shift) {
      // Move light in XZ plane
      const sensitivity = 0.01 * this.distance;
      const az = this.azimuth * Math.PI / 180;
      const rightVec  = [Math.cos(az), 0, -Math.sin(az)];
      const forwardVec = [-Math.sin(az), 0, -Math.cos(az)];
      this.scene.lightPos = [
        this.scene.lightPos[0] + rightVec[0]   * dx * sensitivity - forwardVec[0] * dy * sensitivity,
        this.scene.lightPos[1],
        this.scene.lightPos[2] + rightVec[2]   * dx * sensitivity - forwardVec[2] * dy * sensitivity,
      ];
      this.onReset();
    } else if (leftBtn) {
      // Orbit
      this.azimuth   -= dx * 0.3;
      this.elevation  = Math.max(-80, Math.min(80, this.elevation + dy * 0.3));
      this.updateCamera();
      this.onReset();
    } else if (rightBtn) {
      // Pan target
      const sensitivity = 0.002 * this.distance;
      const az = this.azimuth * Math.PI / 180;
      const el = this.elevation * Math.PI / 180;
      const rightVec = [Math.cos(az), 0, -Math.sin(az)];
      const upVec    = [-Math.sin(el)*Math.sin(az), Math.cos(el), -Math.sin(el)*Math.cos(az)];
      this.scene.cameraTarget = [
        this.scene.cameraTarget[0] - rightVec[0] * dx * sensitivity + upVec[0] * dy * sensitivity,
        this.scene.cameraTarget[1] - rightVec[1] * dx * sensitivity + upVec[1] * dy * sensitivity,
        this.scene.cameraTarget[2] - rightVec[2] * dx * sensitivity + upVec[2] * dy * sensitivity,
      ];
      this.updateCamera();
      this.onReset();
    }
  };


  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.distance = Math.max(0.5, this.distance * (1 + e.deltaY * 0.001));
    this.updateCamera();
    this.onReset();
  };
}
