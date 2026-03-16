import createREGL from 'regl';
import { SwimlanesRenderer } from '@/lib/rendering/swimlanes';
import type { Stats, ViewState } from '@/lib/rendering/types';

const vert = `
precision highp float;
attribute vec2 position;

attribute float instanceStart;
attribute float instanceDuration;
attribute float instanceCmdId;
attribute float instanceChannel;
attribute float instanceBus;
attribute float instanceRank;
attribute float instanceBankgroup;
attribute float instanceBank;

uniform sampler2D u_lookupTable;
uniform sampler2D u_swimlaneLookup;
uniform vec2 u_viewRange;
uniform vec2 u_resolution;
uniform float u_maxBankgroups;
uniform float u_maxBanks;
uniform float u_maxRanks;
uniform float u_numBuses;
uniform float u_swimlaneSize;
uniform float u_rowHeight;

varying vec3 vColor;

void main() {
  // Command properties lookup
  vec2 cmdUv = vec2((instanceCmdId + 0.5) / 256.0, 0.5);
  vec4 properties = texture2D(u_lookupTable, cmdUv);
  vColor = properties.rgb;
  float duration = instanceDuration;

  // X: map world time to NDC
  float viewWidth = u_viewRange.y - u_viewRange.x;

  float worldX = instanceStart + (position.x * duration);
  float ndcX = ((worldX - u_viewRange.x) / viewWidth) * 2.0 - 1.0;

  // Y: lookup swimlane screen position from
  // (channel -> bus -> rank -> bankgroup -> bank)
  float laneIndex =
    instanceChannel * (u_numBuses * u_maxRanks * u_maxBankgroups * u_maxBanks)
    + instanceBus * (u_maxRanks * u_maxBankgroups * u_maxBanks)
    + instanceRank * (u_maxBankgroups * u_maxBanks)
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

const glowVert = `
precision highp float;
attribute vec2 position;
attribute float instanceStart;
attribute float instanceDuration;
attribute float instanceChannel;
attribute float instanceBus;
attribute float instanceRank;
attribute float instanceBankgroup;
attribute float instanceBank;

uniform sampler2D u_swimlaneLookup;
uniform vec2 u_viewRange;
uniform vec2 u_resolution;
uniform float u_maxBankgroups;
uniform float u_maxBanks;
uniform float u_maxRanks;
uniform float u_numBuses;
uniform float u_swimlaneSize;
uniform float u_rowHeight;

varying vec2 vPos;

void main() {
  float duration = instanceDuration;
  float viewWidth = u_viewRange.y - u_viewRange.x;
  float xPaddingClk = 0.8;
  float worldX = instanceStart + mix(-xPaddingClk, duration + xPaddingClk, position.x);
  float ndcX = ((worldX - u_viewRange.x) / viewWidth) * 2.0 - 1.0;

  float laneIndex =
    instanceChannel * (u_numBuses * u_maxRanks * u_maxBankgroups * u_maxBanks)
    + instanceBus * (u_maxRanks * u_maxBankgroups * u_maxBanks)
    + instanceRank * (u_maxBankgroups * u_maxBanks)
    + instanceBankgroup * u_maxBanks
    + instanceBank;
  float uCoord = (laneIndex + 0.5) / u_swimlaneSize;
  float yCenter = texture2D(u_swimlaneLookup, vec2(uCoord, 0.5)).r;
  float yPaddingScale = 1.35;
  float yScreen = yCenter + (position.y - 0.5) * u_rowHeight * yPaddingScale;
  float ndcY = 1.0 - (yScreen / u_resolution.y) * 2.0;

  vPos = position;
  gl_Position = vec4(ndcX, ndcY, 0.0, 1.0);
}
`;

const glowFrag = `
precision highp float;
uniform vec3 u_glowColor;
uniform float u_glowAlpha;
varying vec2 vPos;

void main() {
  // Soft rectangular glow with a smoother rim transition.
  vec2 dist = abs(vPos - 0.5) * 2.0;
  float edge = 1.0 - max(dist.x, dist.y);
  float halo = smoothstep(0.0, 0.9, edge);
  float rim = 1.0 - smoothstep(0.0, 0.5, edge);
  float alpha = clamp((halo * 0.42 + rim * 0.28) * u_glowAlpha, 0.0, 1.0);
  gl_FragColor = vec4(u_glowColor, alpha);
}
`;

interface DrawProps {
  viewRange: [number, number];
  offset: number;
  instances: number;
  startBuffer: createREGL.Buffer;
  durationBuffer: createREGL.Buffer;
  cmdBuffer: createREGL.Buffer;
  channelBuffer: createREGL.Buffer;
  busBuffer: createREGL.Buffer;
  rankBuffer: createREGL.Buffer;
  bankgroupBuffer: createREGL.Buffer;
  bankBuffer: createREGL.Buffer;
}

interface GlowDrawProps {
  viewRange: [number, number];
  instances: number;
}

interface LODLevel {
  startBuffer: createREGL.Buffer;
  durationBuffer: createREGL.Buffer;
  cmdBuffer: createREGL.Buffer;
  channelBuffer: createREGL.Buffer;
  busBuffer: createREGL.Buffer;
  rankBuffer: createREGL.Buffer;
  bankgroupBuffer: createREGL.Buffer;
  bankBuffer: createREGL.Buffer;
  chunkIndex: { time: number; offset: number }[];
  loadedCount: number;
  totalCount: number;

  // For hit data, keep a buffer of the original data for CPU-side lookups.
  // TODO(ziad): Is this gonna be a memory problem?
  cpuStarts: Float32Array;
  cpuCmds: Uint8Array;
  cpuChannels: Uint8Array;
  cpuBuses: Uint8Array;
  cpuBankgroups: Uint8Array;
  cpuBanks: Uint8Array;
  cpuRanks: Uint8Array;
  cpuRows: Int32Array;
  cpuColumns: Int32Array;
  cpuDurations: Float32Array;
  cpuLinkIds: Uint32Array;
}

export interface HitResult {
  eventIndex: number;
  start: number;
  duration: number;
  cmdId: number;
  channel: number;
  bus: number;
  bankgroup: number;
  bank: number;
  rank: number;
  row: number;
  column: number;
  linkId: number;
}

const LOD_FACTORS = [1, 2, 3];
const NUM_LODS = LOD_FACTORS.length;
const NUM_BUS_TYPES = 2;
const COMMAND_BUS = 0;
const DATA_BUS = 1;

// Target max events per pixel before switching to coarser LOD
const EVENTS_PER_PIXEL_THRESHOLD = 1500;

interface CommandTiming {
  commandDuration: number;
  dataDuration: number;
  dataDelay: number;
  emitsData: boolean;
}

interface DecodedTraceChunk {
  starts: Float32Array;
  cmds: Uint8Array;
  channels: Uint8Array;
  bankgroups: Uint8Array;
  banks: Uint8Array;
  ranks: Uint8Array;
  rows: Int32Array;
  columns: Int32Array;
  count: number;
}

interface ExpandedTraceChunk {
  starts: Float32Array;
  durations: Float32Array;
  cmds: Uint8Array;
  channels: Uint8Array;
  buses: Uint8Array;
  bankgroups: Uint8Array;
  banks: Uint8Array;
  ranks: Uint8Array;
  rows: Int32Array;
  columns: Int32Array;
  linkIds: Uint32Array;
  count: number;
}

export class TraceRenderer {
  private swimlaneRenderer: SwimlanesRenderer;
  private lookupTexture: createREGL.Texture;
  private draw: createREGL.DrawCommand;
  private drawGlow: createREGL.DrawCommand;

  private glowStartBuffer: createREGL.Buffer;
  private glowDurationBuffer: createREGL.Buffer;
  private glowChannelBuffer: createREGL.Buffer;
  private glowBusBuffer: createREGL.Buffer;
  private glowRankBuffer: createREGL.Buffer;
  private glowBankgroupBuffer: createREGL.Buffer;
  private glowBankBuffer: createREGL.Buffer;
  private glowActiveInstances = 0;
  private glowStartTimeMs = 0;
  private readonly glowFadeDurationMs = 1600;

  private commandTimings: CommandTiming[] = Array.from({ length: 256 }, () => ({
    commandDuration: 1,
    dataDuration: 1,
    dataDelay: 0,
    emitsData: false,
  }));

  // Absolute clock of the first event.
  referenceTime: number = 0;

  lodLevels: LODLevel[] = [];

  constructor(private readonly regl: createREGL.Regl, private readonly canvas: HTMLCanvasElement | null) {
    const sessionStore = useSessionStore();

    this.lookupTexture = this.regl.texture({ width: 1, height: 1 });
    this.swimlaneRenderer = new SwimlanesRenderer(regl, canvas);
    this.glowStartBuffer = this.regl.buffer({ length: 2 * 4, type: 'float', usage: 'dynamic' });
    this.glowDurationBuffer = this.regl.buffer({ length: 2 * 4, type: 'float', usage: 'dynamic' });
    this.glowChannelBuffer = this.regl.buffer({ length: 2, type: 'uint8', usage: 'dynamic' });
    this.glowBusBuffer = this.regl.buffer({ length: 2, type: 'uint8', usage: 'dynamic' });
    this.glowRankBuffer = this.regl.buffer({ length: 2, type: 'uint8', usage: 'dynamic' });
    this.glowBankgroupBuffer = this.regl.buffer({ length: 2, type: 'uint8', usage: 'dynamic' });
    this.glowBankBuffer = this.regl.buffer({ length: 2, type: 'uint8', usage: 'dynamic' });

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
        instanceDuration: {
          buffer: (ctx: any, props: DrawProps) => props.durationBuffer,
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
        instanceBus: {
          buffer: (ctx: any, props: DrawProps) => props.busBuffer,
          divisor: 1,
          normalized: false,
          offset: (ctx: any, props: DrawProps) => props.offset * 1
        },
        instanceRank: {
          buffer: (ctx: any, props: DrawProps) => props.rankBuffer,
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
        u_maxRanks: () => sessionStore.memoryLayout?.numRanks ?? 1,
        u_numBuses: () => NUM_BUS_TYPES,
        u_swimlaneSize: () => {
          const ml = sessionStore.memoryLayout;
          return ml ? Math.max(ml.numChannels * NUM_BUS_TYPES * ml.numRanks * ml.numBankgroups * ml.numBanks, 1) : 1;
        },
      },

      instances: (ctx: any, props: DrawProps) => props.instances,
      count: 6
    });

    this.drawGlow = this.regl({
      vert: glowVert,
      frag: glowFrag,
      attributes: {
        position: [[0, 0], [1, 0], [0, 1], [0, 1], [1, 0], [1, 1]],
        instanceStart: { buffer: () => this.glowStartBuffer, divisor: 1 },
        instanceDuration: { buffer: () => this.glowDurationBuffer, divisor: 1 },
        instanceChannel: { buffer: () => this.glowChannelBuffer, divisor: 1, normalized: false },
        instanceBus: { buffer: () => this.glowBusBuffer, divisor: 1, normalized: false },
        instanceRank: { buffer: () => this.glowRankBuffer, divisor: 1, normalized: false },
        instanceBankgroup: { buffer: () => this.glowBankgroupBuffer, divisor: 1, normalized: false },
        instanceBank: { buffer: () => this.glowBankBuffer, divisor: 1, normalized: false },
      },
      uniforms: {
        u_viewRange: this.regl.prop<GlowDrawProps, 'viewRange'>('viewRange'),
        u_resolution: (ctx: any) => [ctx.viewportWidth, ctx.viewportHeight],
        u_swimlaneLookup: () => this.swimlaneRenderer.yIndexTexture,
        u_maxBankgroups: () => sessionStore.memoryLayout?.numBankgroups ?? 1,
        u_maxBanks: () => sessionStore.memoryLayout?.numBanks ?? 1,
        u_maxRanks: () => sessionStore.memoryLayout?.numRanks ?? 1,
        u_numBuses: () => NUM_BUS_TYPES,
        u_swimlaneSize: () => {
          const ml = sessionStore.memoryLayout;
          return ml ? Math.max(ml.numChannels * NUM_BUS_TYPES * ml.numRanks * ml.numBankgroups * ml.numBanks, 1) : 1;
        },
        u_rowHeight: 22.0,
        u_glowColor: [1.0, 1.0, 1.0],
        u_glowAlpha: () => this.computeGlowAlpha(),
      },
      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 'src alpha',
          dstRGB: 'one',
          dstAlpha: 'one minus src alpha',
        },
      },
      instances: this.regl.prop<GlowDrawProps, 'instances'>('instances'),
      count: 6,
    });
  }

  update(stats: Stats, viewState: ViewState) {
    if (!this.canvas) return;

    this.swimlaneRenderer.update();

    // Convert absolute view range to relative (matching GPU buffer space).
    // This subtraction happens at f64 precision in JS; the result is small
    // enough to fit in f32 without meaningful loss.
    const relStart = viewState.start - this.referenceTime;
    const relEnd = relStart + viewState.duration;
    
    // Select appropriate LOD based on events per pixel
    const lod0 = this.lodLevels[0]!;
    let estimatedEventsInView = lod0.loadedCount;
    
    const startIdx0 = this.bisectRight(lod0.chunkIndex, relStart);
    const viewStartOffset = startIdx0 > 0 ? lod0.chunkIndex[startIdx0 - 1]!.offset : 0;

    const endIdx0 = this.bisectRight(lod0.chunkIndex, relEnd);
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

    const startBisect = this.bisectRight(chunkIndex, relStart);
    const startOffset = startBisect > 0 ? chunkIndex[startBisect - 1]!.offset : 0;

    const endBisect = this.bisectRight(chunkIndex, relEnd);
    const endOffset = endBisect < chunkIndex.length ? chunkIndex[endBisect]!.offset : loadedCount;

    const count = Math.max(0, endOffset - startOffset);

    stats.currentLod = `1:${LOD_FACTORS[selectedLod] ?? 1}`;
    stats.instancesDrawn = count;

    this.draw({
      viewRange: [relStart, relEnd],
      offset: startOffset,
      instances: count,
      startBuffer: lod.startBuffer,
      durationBuffer: lod.durationBuffer,
      cmdBuffer: lod.cmdBuffer,
      channelBuffer: lod.channelBuffer,
      busBuffer: lod.busBuffer,
      rankBuffer: lod.rankBuffer,
      bankgroupBuffer: lod.bankgroupBuffer,
      bankBuffer: lod.bankBuffer,
    });

    if (this.glowActiveInstances > 0 && this.computeGlowAlpha() > 0) {
      this.drawGlow({
        viewRange: [relStart, relEnd],
        instances: this.glowActiveInstances,
      });
    }
  }

  async start(stats: Stats, viewState: ViewState, signal: AbortSignal) {
    const { trace } = useBackend();

    try {
      for (const lod of this.lodLevels) {
        lod.startBuffer.destroy();
        lod.durationBuffer.destroy();
        lod.cmdBuffer.destroy();
        lod.channelBuffer.destroy();
        lod.busBuffer.destroy();
        lod.rankBuffer.destroy();
        lod.bankgroupBuffer.destroy();
        lod.bankBuffer.destroy();
      }
      this.lodLevels.length = 0;
      this.glowActiveInstances = 0;
      this.glowStartTimeMs = 0;

      for (let i = 0; i < NUM_LODS; i++) {
        const factor = LOD_FACTORS[i]!;
        const lodCount = Math.max(1, Math.ceil((stats.totalEvents * 2) / factor));
        
        this.lodLevels.push({
          startBuffer: this.regl.buffer({ length: lodCount * 4, type: 'float', usage: 'dynamic' }),
          durationBuffer: this.regl.buffer({ length: lodCount * 4, type: 'float', usage: 'dynamic' }),
          cmdBuffer: this.regl.buffer({ length: lodCount, type: 'uint8', usage: 'dynamic' }),
          channelBuffer: this.regl.buffer({ length: lodCount, type: 'uint8', usage: 'dynamic' }),
          busBuffer: this.regl.buffer({ length: lodCount, type: 'uint8', usage: 'dynamic' }),
          rankBuffer: this.regl.buffer({ length: lodCount, type: 'uint8', usage: 'dynamic' }),
          bankgroupBuffer: this.regl.buffer({ length: lodCount, type: 'uint8', usage: 'dynamic' }),
          bankBuffer: this.regl.buffer({ length: lodCount, type: 'uint8', usage: 'dynamic' }),
          chunkIndex: [],
          loadedCount: 0,
          totalCount: lodCount,
          cpuStarts: new Float32Array(lodCount),
          cpuCmds: new Uint8Array(lodCount),
          cpuChannels: new Uint8Array(lodCount),
          cpuBuses: new Uint8Array(lodCount),
          cpuBankgroups: new Uint8Array(lodCount),
          cpuBanks: new Uint8Array(lodCount),
          cpuRanks: new Uint8Array(lodCount),
          cpuRows: new Int32Array(lodCount),
          cpuColumns: new Int32Array(lodCount),
          cpuDurations: new Float32Array(lodCount),
          cpuLinkIds: new Uint32Array(lodCount),
        });
      }
      this.refreshLookupTexture();

      // Fetch the first event's absolute clock at f64 precision.
      // All GPU buffer values will be stored as (clk - referenceTime) in f32,
      // keeping values small enough for sub-cycle precision.
      this.referenceTime = await trace.getFirstEventTime();

      // Load 50k events at a time 
      const CHUNK_SIZE = 50_000;
      const START_TIME = 300;

      const firstChunk = await trace.getEntries(0, 1, this.referenceTime);
      const firstData = this.decodeTraceData(firstChunk);
      const firstExpandedData = this.expandForBusTimelines(firstData, 0);
      if (firstExpandedData.count > 0) {
        viewState.duration = START_TIME;
        // viewState stays in absolute time for the UI / timeline ruler.
        viewState.minTime = this.referenceTime;
        viewState.maxTime = this.referenceTime;
        // The 0.01 adds a small bit of padding to the left so we see the start of the timeline.
        viewState.start = this.referenceTime - viewState.duration * 0.01;

        for (let i = 0; i < NUM_LODS; i++) {
          // chunkIndex stores *relative* times (matching the GPU buffers).
          this.lodLevels[i]!.chunkIndex.push({ time: firstExpandedData.starts[0] ?? 0.0, offset: 0 });
        }
      }

      const maxExpandedChunkSize = CHUNK_SIZE * 2;
      const lodTempStarts: Float32Array[] = LOD_FACTORS.map(f => new Float32Array(Math.ceil(maxExpandedChunkSize / f)));
      const lodTempCmds: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(maxExpandedChunkSize / f)));
      const lodTempChannels: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(maxExpandedChunkSize / f)));
      const lodTempBuses: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(maxExpandedChunkSize / f)));
      const lodTempBankgroups: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(maxExpandedChunkSize / f)));
      const lodTempBanks: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(maxExpandedChunkSize / f)));
      const lodTempRanks: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(maxExpandedChunkSize / f)));
      const lodTempRows: Int32Array[] = LOD_FACTORS.map(f => new Int32Array(Math.ceil(maxExpandedChunkSize / f)));
      const lodTempColumns: Int32Array[] = LOD_FACTORS.map(f => new Int32Array(Math.ceil(maxExpandedChunkSize / f)));
      const lodTempDurations: Float32Array[] = LOD_FACTORS.map(f => new Float32Array(Math.ceil(maxExpandedChunkSize / f)));
      const lodTempLinkIds: Uint32Array[] = LOD_FACTORS.map(f => new Uint32Array(Math.ceil(maxExpandedChunkSize / f)));
      
      // Track offsets for each LOD level separately
      const lodOffsets = new Array(NUM_LODS).fill(0);
      
      // Global index for proper decimation alignment
      let globalRenderedEventIndex = 0;

      // Load the chunks until we reach the end of the buffer.
      let offset = 0;
      while (offset < stats.totalEvents) {
        if (signal.aborted) break;

        const count = Math.min(CHUNK_SIZE, stats.totalEvents - offset);

        const buffer = await trace.getEntries(offset, count, this.referenceTime);
        const data = this.decodeTraceData(buffer);
        const expandedData = this.expandForBusTimelines(data, offset);

        if (expandedData.count > 0) {
          // data.starts are relative f32 values; convert the last one back to
          // absolute (f64) for viewState bounds.
          const lastAbsoluteTime = expandedData.starts[expandedData.count - 1]! + this.referenceTime;
          if (lastAbsoluteTime > viewState.maxTime) {
            viewState.maxTime = lastAbsoluteTime;
            viewState.maxDuration = (viewState.maxTime - viewState.minTime) * 1.2;
          }

          // Process each LOD level
          for (let lodIdx = 0; lodIdx < NUM_LODS; lodIdx++) {
            const factor = LOD_FACTORS[lodIdx]!;
            const lod = this.lodLevels[lodIdx]!;
            const tempStarts = lodTempStarts[lodIdx]!;
            const tempCmds = lodTempCmds[lodIdx]!;
            const tempChannels = lodTempChannels[lodIdx]!;
            const tempBuses = lodTempBuses[lodIdx]!;
            const tempBankgroups = lodTempBankgroups[lodIdx]!;
            const tempBanks = lodTempBanks[lodIdx]!;
            const tempRanks = lodTempRanks[lodIdx]!;
            const tempRows = lodTempRows[lodIdx]!;
            const tempColumns = lodTempColumns[lodIdx]!;
            const tempDurations = lodTempDurations[lodIdx]!;
            const tempLinkIds = lodTempLinkIds[lodIdx]!;
            
            let lodWriteIdx = 0;
            
            for (let i = 0; i < expandedData.count; i++) {
              const globalIdx = globalRenderedEventIndex + i;
              if (globalIdx % factor === 0) {
                tempStarts[lodWriteIdx] = expandedData.starts[i]!;
                tempCmds[lodWriteIdx] = expandedData.cmds[i]!;
                tempChannels[lodWriteIdx] = expandedData.channels[i]!;
                tempBuses[lodWriteIdx] = expandedData.buses[i]!;
                tempBankgroups[lodWriteIdx] = expandedData.bankgroups[i]!;
                tempBanks[lodWriteIdx] = expandedData.banks[i]!;
                tempRanks[lodWriteIdx] = expandedData.ranks[i]!;
                tempRows[lodWriteIdx] = expandedData.rows[i]!;
                tempColumns[lodWriteIdx] = expandedData.columns[i]!;
                tempDurations[lodWriteIdx] = expandedData.durations[i]!;
                tempLinkIds[lodWriteIdx] = expandedData.linkIds[i]!;
                lodWriteIdx++;
              }
            }

            if (lodWriteIdx > 0) {
              if (lodOffsets[lodIdx] > 0 && offset > 0) {
                lod.chunkIndex.push({ time: tempStarts[0]!, offset: lodOffsets[lodIdx] });
              }

              lod.startBuffer.subdata(tempStarts.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 4);
              lod.durationBuffer.subdata(tempDurations.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 4);
              lod.cmdBuffer.subdata(tempCmds.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 1);
              lod.channelBuffer.subdata(tempChannels.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 1);
              lod.busBuffer.subdata(tempBuses.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 1);
              lod.rankBuffer.subdata(tempRanks.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 1);
              lod.bankgroupBuffer.subdata(tempBankgroups.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 1);
              lod.bankBuffer.subdata(tempBanks.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 1);

              // Copy to CPU arrays for hit testing
              lod.cpuStarts.set(tempStarts.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuCmds.set(tempCmds.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuChannels.set(tempChannels.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuBuses.set(tempBuses.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuBankgroups.set(tempBankgroups.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuBanks.set(tempBanks.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuRanks.set(tempRanks.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuRows.set(tempRows.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuColumns.set(tempColumns.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuDurations.set(tempDurations.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuLinkIds.set(tempLinkIds.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              
              lodOffsets[lodIdx] += lodWriteIdx;
              lod.loadedCount = lodOffsets[lodIdx];
            }
          }
        }

        globalRenderedEventIndex += expandedData.count;
        offset += count;

        stats.eventCount = this.lodLevels[0]?.loadedCount ?? 0;

        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    } catch (error) {
      console.log('Streaming Error: ', error);
    }
  }

  refreshLookupTexture() {
    this.lookupTexture = this.createLookupTexture();
  }

  private createLookupTexture() {
    const sessionStore = useSessionStore();
    const config = sessionStore.commandConfig;
    if (!config) return this.regl.texture({ width: 1, height: 1 });

    const MAX_COMMANDS = 256;

    // Format: RGBA, only RGB is used by the shader.
    const data = new Float32Array(MAX_COMMANDS * 4);

    // Default values:
    for (let i = 0; i < MAX_COMMANDS; i++) {
      data[i * 4 + 0] = 0.5; // R
      data[i * 4 + 1] = 0.5; // G
      data[i * 4 + 2] = 0.5; // B
      data[i * 4 + 3] = 1.0;
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

    // Build command/data bus timing metadata once per config refresh.
    const ncl = sessionStore.header?.ncl ?? 0;
    const ncwl = sessionStore.header?.ncwl ?? 0;
    const commandNames = sessionStore.dictionary?.commands ?? {};
    this.commandTimings = Array.from({ length: MAX_COMMANDS }, (_, id) =>
      this.buildCommandTiming(
        commandNames[id] ?? '',
        config.clockPeriods[id] ?? 1,
        ncl,
        ncwl,
      )
    );

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

  private buildCommandTiming(
    commandName: string,
    configuredDuration: number | undefined,
    ncl: number,
    ncwl: number
  ): CommandTiming {
    const normalized = commandName.toUpperCase();
    const isRead = this.isReadCommand(normalized);
    const isWrite = this.isWriteCommand(normalized);
    const dataDuration = configuredDuration && configuredDuration > 0 ? configuredDuration : 1;

    if (isRead) {
      return {
        commandDuration: 1,
        dataDuration,
        dataDelay: Math.max(ncl, 0),
        emitsData: true,
      };
    }

    if (isWrite) {
      return {
        commandDuration: 1,
        dataDuration,
        dataDelay: Math.max(ncwl, 0),
        emitsData: true,
      };
    }

    return {
      commandDuration: 1,
      dataDuration,
      dataDelay: 0,
      emitsData: false,
    };
  }

  private isReadCommand(normalizedName: string): boolean {
    return normalizedName.startsWith('RD') || normalizedName.includes('READ');
  }

  private isWriteCommand(normalizedName: string): boolean {
    return normalizedName.startsWith('WR') || normalizedName.includes('WRITE');
  }

  private decodeTraceData(input: Uint8Array | ArrayBuffer | number[]): DecodedTraceChunk {
    const array = input instanceof Uint8Array ? input : new Uint8Array(input as any);

    // Each entry is 17 bytes (4-byte fields first for alignment):
    //   [Start CLKs (N*4B)][Rows (N*4B)][Columns (N*4B)]
    //   [Cmd IDs (N*1B)][Channels (N*1B)][Bankgroups (N*1B)][Banks (N*1B)][Ranks (N*1B)]
    const N = Math.floor(array.byteLength / 17);

    const base = array.byteOffset;
    const startView = new Float32Array(array.buffer, base, N);
    const rowView = new Int32Array(array.buffer, base + N * 4, N);
    const columnView = new Int32Array(array.buffer, base + N * 8, N);
    const cmdView = new Uint8Array(array.buffer, base + N * 12, N);
    const channelView = new Uint8Array(array.buffer, base + N * 13, N);
    const bankgroupView = new Uint8Array(array.buffer, base + N * 14, N);
    const bankView = new Uint8Array(array.buffer, base + N * 15, N);
    const rankView = new Uint8Array(array.buffer, base + N * 16, N);

    return { starts: startView, cmds: cmdView, channels: channelView, bankgroups: bankgroupView, banks: bankView, ranks: rankView, rows: rowView, columns: columnView, count: N };
  }

  private computeGlowAlpha(): number {
    if (this.glowStartTimeMs <= 0 || this.glowActiveInstances <= 0) return 0;
    const elapsed = performance.now() - this.glowStartTimeMs;
    if (elapsed >= this.glowFadeDurationMs) {
      this.glowActiveInstances = 0;
      return 0;
    }
    return 1 - elapsed / this.glowFadeDurationMs;
  }

  triggerLinkedGlow(hit: HitResult): void {
    const lod = this.lodLevels[0];
    if (!lod) return;

    const primaryIdx = hit.eventIndex;
    const counterpartIdx = this.findCounterpartIndex(lod, primaryIdx, hit.linkId);
    if (counterpartIdx < 0 || counterpartIdx === primaryIdx) {
      // No true command/data counterpart exists for this command.
      // Disable linked-glow behavior in this case.
      this.glowActiveInstances = 0;
      return;
    }

    const starts = new Float32Array(2);
    const durations = new Float32Array(2);
    const channels = new Uint8Array(2);
    const buses = new Uint8Array(2);
    const ranks = new Uint8Array(2);
    const bankgroups = new Uint8Array(2);
    const banks = new Uint8Array(2);

    let count = 0;
    const push = (idx: number) => {
      starts[count] = lod.cpuStarts[idx] ?? 0;
      durations[count] = lod.cpuDurations[idx] ?? 1;
      channels[count] = lod.cpuChannels[idx] ?? 0;
      buses[count] = lod.cpuBuses[idx] ?? 0;
      ranks[count] = lod.cpuRanks[idx] ?? 0;
      bankgroups[count] = lod.cpuBankgroups[idx] ?? 0;
      banks[count] = lod.cpuBanks[idx] ?? 0;
      count++;
    };

    push(primaryIdx);
    push(counterpartIdx);

    this.glowStartBuffer.subdata(starts.subarray(0, count), 0);
    this.glowDurationBuffer.subdata(durations.subarray(0, count), 0);
    this.glowChannelBuffer.subdata(channels.subarray(0, count), 0);
    this.glowBusBuffer.subdata(buses.subarray(0, count), 0);
    this.glowRankBuffer.subdata(ranks.subarray(0, count), 0);
    this.glowBankgroupBuffer.subdata(bankgroups.subarray(0, count), 0);
    this.glowBankBuffer.subdata(banks.subarray(0, count), 0);
    this.glowActiveInstances = count;
    this.glowStartTimeMs = performance.now();
  }

  private findCounterpartIndex(lod: LODLevel, sourceIdx: number, linkId: number): number {
    if (linkId === 0) return -1;

    const window = 8192;
    const left = Math.max(0, sourceIdx - window);
    const right = Math.min(lod.loadedCount, sourceIdx + window);

    for (let i = left; i < right; i++) {
      if (i === sourceIdx) continue;
      if ((lod.cpuLinkIds[i] ?? 0) === linkId) return i;
    }

    for (let i = 0; i < lod.loadedCount; i++) {
      if (i === sourceIdx) continue;
      if ((lod.cpuLinkIds[i] ?? 0) === linkId) return i;
    }

    return -1;
  }

  private expandForBusTimelines(data: DecodedTraceChunk, baseEntryIndex: number): ExpandedTraceChunk {
    const maxOutputEvents = data.count * 2;
    const starts = new Float32Array(maxOutputEvents);
    const durations = new Float32Array(maxOutputEvents);
    const cmds = new Uint8Array(maxOutputEvents);
    const channels = new Uint8Array(maxOutputEvents);
    const buses = new Uint8Array(maxOutputEvents);
    const bankgroups = new Uint8Array(maxOutputEvents);
    const banks = new Uint8Array(maxOutputEvents);
    const ranks = new Uint8Array(maxOutputEvents);
    const rows = new Int32Array(maxOutputEvents);
    const columns = new Int32Array(maxOutputEvents);
    const linkIds = new Uint32Array(maxOutputEvents);

    const ml = useSessionStore().memoryLayout;
    const maxChannels = Math.max((ml?.numChannels ?? 1) - 1, 0);
    const maxRanks = Math.max((ml?.numRanks ?? 1) - 1, 0);
    const maxBankgroups = Math.max((ml?.numBankgroups ?? 1) - 1, 0);
    const maxBanks = Math.max((ml?.numBanks ?? 1) - 1, 0);

    let writeIdx = 0;

    for (let i = 0; i < data.count; i++) {
      const cmdId = data.cmds[i] ?? 0;
      const timing = this.commandTimings[cmdId] ?? {
        commandDuration: 1,
        dataDuration: 1,
        dataDelay: 0,
        emitsData: false,
      };

      const start = data.starts[i] ?? 0;
      const channel = Math.min(data.channels[i] ?? 0, maxChannels);
      const rank = Math.min(data.ranks[i] ?? 0, maxRanks);
      const bankgroup = Math.min(data.bankgroups[i] ?? 0, maxBankgroups);
      const bank = Math.min(data.banks[i] ?? 0, maxBanks);
      const row = data.rows[i] ?? -1;
      const column = data.columns[i] ?? -1;
      const linkId = (baseEntryIndex + i + 1) >>> 0;

      // Command bus event (JEDEC command/address bus timing): always 1 tCK.
      starts[writeIdx] = start;
      durations[writeIdx] = timing.commandDuration;
      cmds[writeIdx] = cmdId;
      channels[writeIdx] = channel;
      buses[writeIdx] = COMMAND_BUS;
      bankgroups[writeIdx] = bankgroup;
      banks[writeIdx] = bank;
      ranks[writeIdx] = rank;
      rows[writeIdx] = row;
      columns[writeIdx] = column;
      linkIds[writeIdx] = linkId;
      writeIdx++;

      // Data bus burst event, shifted by RL/WL (nCL/nCWL) from command issue.
      if (timing.emitsData) {
        starts[writeIdx] = start + timing.dataDelay;
        durations[writeIdx] = timing.dataDuration;
        cmds[writeIdx] = cmdId;
        channels[writeIdx] = channel;
        buses[writeIdx] = DATA_BUS;
        bankgroups[writeIdx] = bankgroup;
        banks[writeIdx] = bank;
        ranks[writeIdx] = rank;
        rows[writeIdx] = row;
        columns[writeIdx] = column;
        linkIds[writeIdx] = linkId;
        writeIdx++;
      }
    }

    const order = Array.from({ length: writeIdx }, (_, idx) => idx).sort((a, b) => starts[a]! - starts[b]!);
    const sortedStarts = new Float32Array(writeIdx);
    const sortedDurations = new Float32Array(writeIdx);
    const sortedCmds = new Uint8Array(writeIdx);
    const sortedChannels = new Uint8Array(writeIdx);
    const sortedBuses = new Uint8Array(writeIdx);
    const sortedBankgroups = new Uint8Array(writeIdx);
    const sortedBanks = new Uint8Array(writeIdx);
    const sortedRanks = new Uint8Array(writeIdx);
    const sortedRows = new Int32Array(writeIdx);
    const sortedColumns = new Int32Array(writeIdx);
    const sortedLinkIds = new Uint32Array(writeIdx);

    for (let i = 0; i < writeIdx; i++) {
      const sourceIdx = order[i]!;
      sortedStarts[i] = starts[sourceIdx]!;
      sortedDurations[i] = durations[sourceIdx]!;
      sortedCmds[i] = cmds[sourceIdx]!;
      sortedChannels[i] = channels[sourceIdx]!;
      sortedBuses[i] = buses[sourceIdx]!;
      sortedBankgroups[i] = bankgroups[sourceIdx]!;
      sortedBanks[i] = banks[sourceIdx]!;
      sortedRanks[i] = ranks[sourceIdx]!;
      sortedRows[i] = rows[sourceIdx]!;
      sortedColumns[i] = columns[sourceIdx]!;
      sortedLinkIds[i] = linkIds[sourceIdx]!;
    }

    return {
      starts: sortedStarts,
      durations: sortedDurations,
      cmds: sortedCmds,
      channels: sortedChannels,
      buses: sortedBuses,
      bankgroups: sortedBankgroups,
      banks: sortedBanks,
      ranks: sortedRanks,
      rows: sortedRows,
      columns: sortedColumns,
      linkIds: sortedLinkIds,
      count: writeIdx,
    };
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

  hitTest(mouseX: number, mouseY: number, viewState: ViewState): HitResult | null { 
    if (!this.canvas) return null;

    const canvasWidth = this.canvas.width;

    if (this.lodLevels.length === 0) return null;

    const lod = this.lodLevels[0]!; // The finest LOD level.
    if (lod.loadedCount === 0) return null;

    // Convert mouse's X position to relative time. 
    const relStart = viewState.start - this.referenceTime;
    const relTime = relStart + (mouseX / canvasWidth) * viewState.duration;

    // Get swimlane data for Y checking
    const memoryLayout = useSessionStore().memoryLayout;
    if (!memoryLayout) return null;
    const { numRanks, numBankgroups, numBanks } = memoryLayout;
    // TODO(ziad): This matches the shaders `u_rowHeight` uniform but we gotta make it dynamic.
    const rowHeight = 16.0;

    const swimlaneData = this.swimlaneRenderer.swimlaneCache.data;
    if (!swimlaneData) return null;

    // Binary search directly on cpuStarts to find the first event where start > relTime
    const bisectIdx = this.bisectRightStarts(lod.cpuStarts, relTime, lod.loadedCount);
    
    // Search window: go back to catch events whose start + duration covers relTime
    // Events are sorted by start time, so we need to look backwards for events
    // that started before relTime but might still be active (start + duration > relTime)
    const searchStart = Math.max(0, bisectIdx - 500);
    const searchEnd = Math.min(lod.loadedCount, bisectIdx + 100);

    for (let i = searchStart; i < searchEnd; i++) {
      const eventStart = lod.cpuStarts[i]!;
      const cmdId = lod.cpuCmds[i]!;
      const duration = lod.cpuDurations[i] ?? 1;
      
      // Check time intersection: event spans [eventStart, eventStart + duration]
      if (relTime < eventStart || relTime > eventStart + duration) continue;
      
      // Check Y intersection
      const channel = lod.cpuChannels[i]!;
      const bus = lod.cpuBuses[i]!;
      const rank = lod.cpuRanks[i]!;
      const bankgroup = lod.cpuBankgroups[i]!;
      const bank = lod.cpuBanks[i]!;
      
      const laneIdx =
        channel * (NUM_BUS_TYPES * numRanks * numBankgroups * numBanks) +
        bus * (numRanks * numBankgroups * numBanks) +
        rank * (numBankgroups * numBanks) +
        bankgroup * numBanks +
        bank;
      const yCenter = swimlaneData[laneIdx * 4] ?? 0;
      
      if (Math.abs(mouseY - yCenter) <= rowHeight / 2) {
        const row = lod.cpuRows[i]!;
        const column = lod.cpuColumns[i]!;
        const linkId = lod.cpuLinkIds[i] ?? 0;
        return { eventIndex: i, start: eventStart, duration, cmdId, channel, bus, bankgroup, bank, rank, row, column, linkId };
      }
    }
    
    return null;
  }

  // Binary search on cpuStarts array (upper bound)
  private bisectRightStarts(starts: Float32Array, time: number, count: number): number {
    let lo = 0, hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (starts[mid]! <= time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}