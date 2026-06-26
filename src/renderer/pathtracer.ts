import pathtraceWGSL from './shaders/pathtrace.wgsl?raw';
import displayWGSL from './shaders/display.wgsl?raw';
import { UNIFORM_BUFFER_SIZE } from '../scene/scene';

export class PathTracer {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private format: GPUTextureFormat;

  private uniformBuffer: GPUBuffer;
  private uniformData: Float32Array;
  private uniformDataU32: Uint32Array;

  // Ping-pong textures: texA/texB alternate as read/write each frame.
  // Both need TEXTURE_BINDING (for read via textureLoad) and STORAGE_BINDING (for write).
  private texA!: GPUTexture;
  private texB!: GPUTexture;
  private texAView!: GPUTextureView;
  private texBView!: GPUTextureView;

  private computePipeline!: GPUComputePipeline;
  // [0]: reads texA, writes texB  |  [1]: reads texB, writes texA
  private computeBindGroups!: [GPUBindGroup, GPUBindGroup];

  private displayPipeline!: GPURenderPipeline;
  // [0]: displays texB (written by computeBindGroups[0])
  // [1]: displays texA (written by computeBindGroups[1])
  private displayBindGroups!: [GPUBindGroup, GPUBindGroup];

  // Alternates 0/1 every frame to select which bind group pair to use.
  private frameIndex = 0;

  width = 0;
  height = 0;

  constructor(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat) {
    this.device = device;
    this.context = context;
    this.format = format;

    this.uniformBuffer = device.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const ab = new ArrayBuffer(UNIFORM_BUFFER_SIZE);
    this.uniformData    = new Float32Array(ab);
    this.uniformDataU32 = new Uint32Array(ab);

    this.buildPipelines();
  }

  private buildPipelines() {
    const { device } = this;

    this.computePipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({ code: pathtraceWGSL }),
        entryPoint: 'main',
      },
    });

    const displayModule = device.createShaderModule({ code: displayWGSL });
    this.displayPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex:   { module: displayModule, entryPoint: 'vs' },
      fragment: {
        module: displayModule,
        entryPoint: 'fs',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width  = width;
    this.height = height;

    this.texA?.destroy();
    this.texB?.destroy();

    const texDesc: GPUTextureDescriptor = {
      size: [width, height],
      format: 'rgba32float',
      // TEXTURE_BINDING: readable with textureLoad as texture_2d<f32>
      // STORAGE_BINDING: writable with textureStore as storage texture (write)
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    };
    this.texA     = this.device.createTexture(texDesc);
    this.texB     = this.device.createTexture(texDesc);
    this.texAView = this.texA.createView();
    this.texBView = this.texB.createView();

    this.rebuildBindGroups();
  }

  private rebuildBindGroups() {
    const { device } = this;
    const computeLayout = this.computePipeline.getBindGroupLayout(0);
    const displayLayout = this.displayPipeline.getBindGroupLayout(0);

    const makeCompute = (readView: GPUTextureView, writeView: GPUTextureView) =>
      device.createBindGroup({
        layout: computeLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: readView  },
          { binding: 2, resource: writeView },
        ],
      });

    const makeDisplay = (view: GPUTextureView) =>
      device.createBindGroup({
        layout: displayLayout,
        entries: [{ binding: 0, resource: view }],
      });

    this.computeBindGroups = [
      makeCompute(this.texAView, this.texBView), // reads A, writes B
      makeCompute(this.texBView, this.texAView), // reads B, writes A
    ];
    this.displayBindGroups = [
      makeDisplay(this.texBView), // frame 0 wrote B
      makeDisplay(this.texAView), // frame 1 wrote A
    ];
  }

  uploadUniforms(data: Float32Array, dataU32: Uint32Array) {
    this.uniformData.set(data);
    this.uniformDataU32[3] = dataU32[3];
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData.buffer as ArrayBuffer);
  }

  render(uniformData: Float32Array, uniformDataU32: Uint32Array) {
    this.uploadUniforms(uniformData, uniformDataU32);

    const fi = this.frameIndex;
    const encoder = this.device.createCommandEncoder();

    // Compute pass
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipeline);
      pass.setBindGroup(0, this.computeBindGroups[fi]);
      pass.dispatchWorkgroups(
        Math.ceil(this.width  / 8),
        Math.ceil(this.height / 8),
      );
      pass.end();
    }

    // Display pass — shows the texture written by the compute pass above
    {
      const view = this.context.getCurrentTexture().createView();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }],
      });
      pass.setPipeline(this.displayPipeline);
      pass.setBindGroup(0, this.displayBindGroups[fi]);
      pass.draw(3);
      pass.end();
    }

    this.device.queue.submit([encoder.finish()]);
    this.frameIndex ^= 1;
  }
}
