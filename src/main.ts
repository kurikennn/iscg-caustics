import { Pane } from 'tweakpane';
import { PathTracer } from './renderer/pathtracer';
import { defaultScene, writeUniforms, UNIFORM_BUFFER_SIZE } from './scene/scene';
import { CameraControls } from './ui/controls';

async function init() {
  const errorDiv = document.getElementById('error')!;

  function fatal(msg: string) {
    errorDiv.textContent = msg;
    errorDiv.classList.add('visible');
    throw new Error(msg);
  }

  if (!navigator.gpu) {
    fatal('WebGPU is not supported in this browser.\nPlease use Chrome 113+ with WebGPU enabled.');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) fatal('No WebGPU adapter found.');

  const device = await adapter!.requestDevice();

  device.lost.then((info: GPUDeviceLostInfo) => {
    if (info.reason !== 'destroyed') {
      fatal(`WebGPU device lost: ${info.message}`);
    }
  });

  const canvas  = document.getElementById('canvas') as HTMLCanvasElement;
  const context = canvas.getContext('webgpu')!;
  const format  = navigator.gpu.getPreferredCanvasFormat();

  context.configure({ device, format, alphaMode: 'opaque' });

  const scene = { ...defaultScene };
  const ab    = new ArrayBuffer(UNIFORM_BUFFER_SIZE);
  const fData = new Float32Array(ab);
  const uData = new Uint32Array(ab);

  let frameCount = 0;
  const resetAccum = () => { frameCount = 0; };

  const pathtracer = new PathTracer(device, context, format);

  // Resize canvas to fill window
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    pathtracer.resize(canvas.width, canvas.height);
    resetAccum();
  }

  window.addEventListener('resize', resize);
  resize();

  new CameraControls(canvas, scene, resetAccum);

  const lightParams = { x: scene.lightPos[0], y: scene.lightPos[1], z: scene.lightPos[2] };
  const pane   = new Pane({ title: 'Controls' });
  const folder = pane.addFolder({ title: 'Light Position' });
  const syncLight = () => {
    scene.lightPos = [lightParams.x, lightParams.y, lightParams.z];
    resetAccum();
  };
  folder.addBinding(lightParams, 'x', { min: -10, max: 10, step: 0.1 }).on('change', syncLight);
  folder.addBinding(lightParams, 'y', { min: 0.5, max: 20,  step: 0.1 }).on('change', syncLight);
  folder.addBinding(lightParams, 'z', { min: -10, max: 10, step: 0.1 }).on('change', syncLight);

  const infoEl = document.getElementById('samples')!;

  function frame() {
    writeUniforms(fData, uData, scene, frameCount, canvas.width, canvas.height);
    pathtracer.render(fData, uData);
    frameCount++;
    infoEl.textContent = `samples: ${frameCount}`;
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

init().catch(console.error);
