import createREGL from 'regl';
import { SwimlanesRenderer } from '@/lib/rendering/swimlanes';
import type { Stats, ViewState } from '@/lib/rendering/types';

const vert = `
precision highp float;
attribute vec2 position;

attribute float instanceStart;
attribute float instanceCmdId;
attribute float instanceChannel;
attribute float instanceBankgroup;
attribute float instanceBank;

uniform sampler2D u_lookupTable;
uniform sampler2D u_swimlaneLookup;
uniform vec2 u_viewRange;
uniform vec2 u_resolution;
uniform float u_maxBankgroups;
uniform float u_maxBanks;
uniform float u_swimlaneSize;
uniform float u_rowHeight;

varying vec3 vColor;

void main() {
  // Command properties lookup
  vec2 cmdUv = vec2((instanceCmdId + 0.5) / 256.0, 0.5);
  vec4 properties = texture2D(u_lookupTable, cmdUv);
  vColor = properties.rgb;
  float duration = properties.a;

  // X: map world time to NDC
  float viewWidth = u_viewRange.y - u_viewRange.x;

  float worldX = instanceStart + (position.x * duration);
  float ndcX = ((worldX - u_viewRange.x) / viewWidth) * 2.0 - 1.0;

  // Y: lookup swimlane screen position from (channel, bankgroup, bank)
  float laneIndex = instanceChannel * (u_maxBankgroups * u_maxBanks)
                  + instanceBankgroup * u_maxBanks
                  + instanceBank;
  float uCoord = (laneIndex + 0.5) / u_swimlaneSize;
  float yCenter = texture2D(u_swimlaneLookup, vec2(uCoord, 0.5)).r;

  // position.y is 0 or 1 (quad vertices), center the rect on yCenter
  float yScreen = yCenter + (position.y - 0.5) * u_rowHeight;
  float ndcY = 1.0 - (yScreen / u_resolution.y) * 2.0;

  gl_Position = vec4(ndcX, ndcY, 0, 1);
}
`

const frag = `
precision highp float;
varying vec3 vColor;

void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`;

interface DrawProps {
  viewRange: [number, number];
  offset: number;
  instances: number;
  startBuffer: createREGL.Buffer;
  cmdBuffer: createREGL.Buffer;
  channelBuffer: createREGL.Buffer;
  bankgroupBuffer: createREGL.Buffer;
  bankBuffer: createREGL.Buffer;
}

interface LODLevel {
  startBuffer: createREGL.Buffer;
  cmdBuffer: createREGL.Buffer;
  channelBuffer: createREGL.Buffer;
  bankgroupBuffer: createREGL.Buffer;
  bankBuffer: createREGL.Buffer;
  chunkIndex: { time: number; offset: number }[];
  loadedCount: number;
  totalCount: number;
}

const LOD_FACTORS = [1, 2, 3];
const NUM_LODS = LOD_FACTORS.length;

// Target max events per pixel before switching to coarser LOD
const EVENTS_PER_PIXEL_THRESHOLD = 1500;

export class TraceRenderer {
  private swimlaneRenderer: SwimlanesRenderer;
  private lookupTexture: createREGL.Texture;
  private draw: createREGL.DrawCommand;

  lodLevels: LODLevel[] = [];

  constructor(private readonly regl: createREGL.Regl, private readonly canvas: HTMLCanvasElement | null) {
    const sessionStore = useSessionStore();

    this.lookupTexture = this.regl.texture({ width: 1, height: 1 });
    this.swimlaneRenderer = new SwimlanesRenderer(regl, canvas);

    this.draw = this.regl({
      vert,
      frag,

      attributes: {
        position: [[0, 0], [1, 0], [0, 1], [0, 1], [1, 0], [1, 1]],
        instanceStart: {
          buffer: (ctx: any, props: DrawProps) => props.startBuffer,
          divisor: 1,
          offset: (ctx: any, props: DrawProps) => props.offset * 4
        },
        instanceCmdId: {
          buffer: (ctx: any, props: DrawProps) => props.cmdBuffer,
          divisor: 1,
          normalized: false,
          offset: (ctx: any, props: DrawProps) => props.offset * 1
        },
        instanceChannel: {
          buffer: (ctx: any, props: DrawProps) => props.channelBuffer,
          divisor: 1,
          normalized: false,
          offset: (ctx: any, props: DrawProps) => props.offset * 1
        },
        instanceBankgroup: {
          buffer: (ctx: any, props: DrawProps) => props.bankgroupBuffer,
          divisor: 1,
          normalized: false,
          offset: (ctx: any, props: DrawProps) => props.offset * 1
        },
        instanceBank: {
          buffer: (ctx: any, props: DrawProps) => props.bankBuffer,
          divisor: 1,
          normalized: false,
          offset: (ctx: any, props: DrawProps) => props.offset * 1
        },
      },

      uniforms: {
        u_viewRange: regl.prop<DrawProps, 'viewRange'>('viewRange'),
        u_rowHeight: 16.0,
        u_resolution: (ctx: any) => [ctx.viewportWidth, ctx.viewportHeight],
        u_lookupTable: () => this.lookupTexture,
        u_swimlaneLookup: () => this.swimlaneRenderer.yIndexTexture,
        u_maxBankgroups: () => sessionStore.memoryLayout?.numBankgroups ?? 1,
        u_maxBanks: () => sessionStore.memoryLayout?.numBanks ?? 1,
        u_swimlaneSize: () => {
          const ml = sessionStore.memoryLayout;
          return ml ? Math.max(ml.numChannels * ml.numBankgroups * ml.numBanks, 1) : 1;
        },
      },

      instances: (ctx: any, props: DrawProps) => props.instances,
      count: 6
    });
  }

  update(stats: Stats, viewState: ViewState) {
    if (!this.canvas) return;

    this.swimlaneRenderer.update();
    
    // Select appropriate LOD based on events per pixel
    const lod0 = this.lodLevels[0]!;
    let estimatedEventsInView = lod0.loadedCount;
    
    const startIdx0 = this.bisectRight(lod0.chunkIndex, viewState.start);
    const viewStartOffset = startIdx0 > 0 ? lod0.chunkIndex[startIdx0 - 1]!.offset : 0;

    const endIdx0 = this.bisectRight(lod0.chunkIndex, viewState.start + viewState.duration);
    const viewEndOffset = endIdx0 < lod0.chunkIndex.length ? lod0.chunkIndex[endIdx0]!.offset : lod0.loadedCount;

    estimatedEventsInView = viewEndOffset - viewStartOffset;

    const canvasWidth = this.canvas?.width ?? 1920;
    const eventsPerPixel = estimatedEventsInView / canvasWidth;

    let selectedLod = 0;
    for (let i = 0; i < NUM_LODS; i++) {
      const factor = LOD_FACTORS[i]!;
      const lodEventsPerPixel = eventsPerPixel / factor;
      if (lodEventsPerPixel <= EVENTS_PER_PIXEL_THRESHOLD) {
        selectedLod = i;
        break;
      }
      // If even the coarsest LOD has too many events, use it anyway
      selectedLod = i;
    }

    const lod = this.lodLevels[selectedLod]!;
    const chunkIndex = lod.chunkIndex;
    const loadedCount = lod.loadedCount;

    const startBisect = this.bisectRight(chunkIndex, viewState.start);
    const startOffset = startBisect > 0 ? chunkIndex[startBisect - 1]!.offset : 0;

    const endBisect = this.bisectRight(chunkIndex, viewState.start + viewState.duration);
    const endOffset = endBisect < chunkIndex.length ? chunkIndex[endBisect]!.offset : loadedCount;

    const count = Math.max(0, endOffset - startOffset);

    stats.currentLod = `1:${LOD_FACTORS[selectedLod] ?? 1}`;
    stats.instancesDrawn = count;

    this.draw({
      viewRange: [viewState.start, viewState.start + viewState.duration],
      offset: startOffset,
      instances: count,
      startBuffer: lod.startBuffer,
      cmdBuffer: lod.cmdBuffer,
      channelBuffer: lod.channelBuffer,
      bankgroupBuffer: lod.bankgroupBuffer,
      bankBuffer: lod.bankBuffer,
    });
  }

  async start(stats: Stats, viewState: ViewState, signal: AbortSignal) {
    const { trace } = useBackend();

    try {
      for (const lod of this.lodLevels) {
        lod.startBuffer.destroy();
        lod.cmdBuffer.destroy();
        lod.channelBuffer.destroy();
        lod.bankgroupBuffer.destroy();
        lod.bankBuffer.destroy();
      }
      this.lodLevels.length = 0;

      for (let i = 0; i < NUM_LODS; i++) {
        const factor = LOD_FACTORS[i]!;
        const lodCount = Math.ceil(stats.totalEvents / factor);
        
        this.lodLevels.push({
          startBuffer: this.regl.buffer({ length: lodCount * 4, type: 'float', usage: 'dynamic' }),
          cmdBuffer: this.regl.buffer({ length: lodCount, type: 'uint8', usage: 'dynamic' }),
          channelBuffer: this.regl.buffer({ length: lodCount, type: 'uint8', usage: 'dynamic' }),
          bankgroupBuffer: this.regl.buffer({ length: lodCount, type: 'uint8', usage: 'dynamic' }),
          bankBuffer: this.regl.buffer({ length: lodCount, type: 'uint8', usage: 'dynamic' }),
          chunkIndex: [],
          loadedCount: 0,
          totalCount: lodCount
        });
      }
      this.lookupTexture = await this.createLookupTexture();

      // Load 50k events at a time 
      const CHUNK_SIZE = 50_000;
      const START_TIME = 300;

      const firstChunk = await trace.getEntries(0, 1);
      const firstData = this.decodeTraceData(firstChunk);
      if (firstData.count > 0) {
        viewState.duration = START_TIME;
        // The 0.01 adds a small bit of padding to the left so we see the start of the timeline.
        viewState.start = -viewState.duration * 0.01;

        for (let i = 0; i < NUM_LODS; i++) {
          this.lodLevels[i]!.chunkIndex.push({ time: firstData.starts[0] ?? 0.0, offset: 0 });
        }
      }

      const lodTempStarts: Float32Array[] = LOD_FACTORS.map(f => new Float32Array(Math.ceil(CHUNK_SIZE / f)));
      const lodTempCmds: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(CHUNK_SIZE / f)));
      const lodTempChannels: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(CHUNK_SIZE / f)));
      const lodTempBankgroups: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(CHUNK_SIZE / f)));
      const lodTempBanks: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(CHUNK_SIZE / f)));
      
      // Track offsets for each LOD level separately
      const lodOffsets = new Array(NUM_LODS).fill(0);
      
      // Global index for proper decimation alignment
      let globalEventIndex = 0;

      // Load the chunks until we reach the end of the buffer.
      let offset = 0;
      while (offset < stats.totalEvents) {
        if (signal.aborted) break;

        const count = Math.min(CHUNK_SIZE, stats.totalEvents - offset);

        const buffer = await trace.getEntries(offset, count);
        const data = this.decodeTraceData(buffer);

        if (data.count > 0) {
          // Update the max time if we've seen a new event.
          const lastTime = data.starts[data.count - 1]!;
          if (lastTime > viewState.maxTime) {
            viewState.maxTime = lastTime;
            viewState.maxDuration = (viewState.maxTime - viewState.minTime) * 1.2;
          }

          // Process each LOD level
          for (let lodIdx = 0; lodIdx < NUM_LODS; lodIdx++) {
            const factor = LOD_FACTORS[lodIdx]!;
            const lod = this.lodLevels[lodIdx]!;
            const tempStarts = lodTempStarts[lodIdx]!;
            const tempCmds = lodTempCmds[lodIdx]!;
            const tempChannels = lodTempChannels[lodIdx]!;
            const tempBankgroups = lodTempBankgroups[lodIdx]!;
            const tempBanks = lodTempBanks[lodIdx]!;
            
            let lodWriteIdx = 0;
            
            for (let i = 0; i < data.count; i++) {
              const globalIdx = globalEventIndex + i;
              if (globalIdx % factor === 0) {
                tempStarts[lodWriteIdx] = data.starts[i]!;
                tempCmds[lodWriteIdx] = data.cmds[i]!;
                tempChannels[lodWriteIdx] = data.channels[i]!;
                tempBankgroups[lodWriteIdx] = data.bankgroups[i]!;
                tempBanks[lodWriteIdx] = data.banks[i]!;
                lodWriteIdx++;
              }
            }

            if (lodWriteIdx > 0) {
              if (lodOffsets[lodIdx] > 0 && offset > 0) {
                lod.chunkIndex.push({ time: tempStarts[0]!, offset: lodOffsets[lodIdx] });
              }

              lod.startBuffer.subdata(tempStarts.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 4);
              lod.cmdBuffer.subdata(tempCmds.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 1);
              lod.channelBuffer.subdata(tempChannels.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 1);
              lod.bankgroupBuffer.subdata(tempBankgroups.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 1);
              lod.bankBuffer.subdata(tempBanks.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 1);
              
              lodOffsets[lodIdx] += lodWriteIdx;
              lod.loadedCount = lodOffsets[lodIdx];
            }
          }
        }

        globalEventIndex += data.count;
        offset += count;

        stats.eventCount = this.lodLevels[0]?.loadedCount ?? 0;

        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    } catch (error) {
      console.log('Streaming Error: ', error);
    }
  }

  private async createLookupTexture() {
    const { store } = useBackend();

    const config = await store.getCommandConfig();
    if (!config) return this.regl.texture({ width: 1, height: 1 });

    const MAX_COMMANDS = 256;

    // Format: RGBA (R,G,B, Duration)
    const data = new Float32Array(MAX_COMMANDS * 4);

    // Default values:
    for (let i = 0; i < MAX_COMMANDS; i++) {
      data[i * 4 + 0] = 0.5; // R
      data[i * 4 + 1] = 0.5; // G
      data[i * 4 + 2] = 0.5; // B
      data[i * 4 + 3] = 10.0; // Duration
    }

    const hex2rgb = (hex: string) => {
      hex = hex.replace('#', '');
      return [
        parseInt(hex.substring(0, 2), 16) / 255,
        parseInt(hex.substring(2, 4), 16) / 255,
        parseInt(hex.substring(4, 6), 16) / 255
      ];
    };

    for (const [idStr, hex] of Object.entries(config.colors)) {
      const id = parseInt(idStr);
      if (id < 0 || id > 255) continue;

      const [r, g, b] = hex2rgb(hex);
      data[id * 4 + 0] = r ?? 0.5;
      data[id * 4 + 1] = g ?? 0.5;
      data[id * 4 + 2] = b ?? 0.5;
    }

    for (const [idStr, dur] of Object.entries(config.clockPeriods)) {
      const id = parseInt(idStr);
      if (id < 0 || id > 255) continue;
      if (dur) data[id * 4 + 3] = dur;
    }

    return this.regl.texture({
      width: 256,
      height: 1,
      data: data,
      format: 'rgba',
      type: 'float',
      min: 'nearest',
      mag: 'nearest'
    });
  }

  private decodeTraceData(input: Uint8Array | ArrayBuffer | number[]) {
    const array = input instanceof Uint8Array ? input : new Uint8Array(input as any);

    // Each entry is 8 bytes: 4 bytes for start + 1 byte for cmd id + 1 byte for channel + 1 byte for bankgroup + 1 byte for bank.
    const N = array.byteLength / 8;

    const startBytes = N * 4;

    const startView = new Float32Array(array.buffer, array.byteOffset, N);
    const cmdView = new Uint8Array(array.buffer, array.byteOffset + startBytes, N);
    const channelView = new Uint8Array(array.buffer, array.byteOffset + startBytes + N, N);
    const bankgroupView = new Uint8Array(array.buffer, array.byteOffset + startBytes + (2 * N), N);
    const bankView = new Uint8Array(array.buffer, array.byteOffset + startBytes + (3 * N), N);

    return { starts: startView, cmds: cmdView, channels: channelView, bankgroups: bankgroupView, banks: bankView, count: N };
  }

  // Binary search helper (upper bound) to return the first index where chunkIndex[i].time > time.
  private bisectRight(index: { time: number; offset: number }[], time: number) {
    let lo = 0, hi = index.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (index[mid]!.time <= time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}