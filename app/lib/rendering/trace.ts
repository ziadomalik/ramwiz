import createREGL from 'regl';
import { SwimlanesRenderer } from '@/lib/rendering/swimlanes';
import { getViolationReasons } from '@/lib/rendering/constraints';
import type { ConstraintRule } from '@/composables/useBackend';
import type { Stats, ViewState } from '@/lib/rendering/types';
import type { WorkerInput, WorkerOutput } from '@/lib/rendering/constraintWorker';

const vert = `
precision highp float;
attribute vec2 position;

attribute float instanceStart;
attribute float instanceCmdId;
attribute float instanceChannel;
attribute float instanceBankgroup;
attribute float instanceBank;
attribute float instanceViolation;

uniform sampler2D u_lookupTable;
uniform sampler2D u_swimlaneLookup;
uniform vec2 u_viewRange;
uniform vec2 u_resolution;
uniform float u_maxBankgroups;
uniform float u_maxBanks;
uniform float u_swimlaneSize;
uniform float u_rowHeight;

varying vec3 vColor;
varying float vViolation;

void main() {
  // Command properties lookup
  vec2 cmdUv = vec2((instanceCmdId + 0.5) / 256.0, 0.5);
  vec4 properties = texture2D(u_lookupTable, cmdUv);
  vColor = properties.rgb;
  float duration = properties.a;
  vViolation = instanceViolation;

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
varying float vViolation;

void main() {
  vec3 violationColor = vec3(1.0, 0.15, 0.15);
  vec3 finalColor = mix(vColor, violationColor, vViolation * 0.7);
  gl_FragColor = vec4(finalColor, 1.0);
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
  violationBuffer: createREGL.Buffer;
}

interface LODLevel {
  startBuffer: createREGL.Buffer;
  cmdBuffer: createREGL.Buffer;
  channelBuffer: createREGL.Buffer;
  bankgroupBuffer: createREGL.Buffer;
  bankBuffer: createREGL.Buffer;
  violationBuffer: createREGL.Buffer;
  chunkIndex: { time: number; offset: number }[];
  loadedCount: number;
  totalCount: number;

  // For hit data, keep a buffer of the original data for CPU-side lookups.
  // TODO(ziad): Is this gonna be a memory problem?
  cpuStarts: Float32Array;
  cpuCmds: Uint8Array;
  cpuChannels: Uint8Array;
  cpuBankgroups: Uint8Array;
  cpuBanks: Uint8Array;
  cpuRanks: Uint8Array;
  cpuRows: Int32Array;
  cpuColumns: Int32Array;
  cpuViolations: Uint8Array;
}

export interface HitResult {
  eventIndex: number;
  start: number;
  duration: number;
  cmdId: number;
  channel: number;
  bankgroup: number;
  bank: number;
  rank: number;
  row: number;
  column: number;
  violation: boolean;
  violationReasons: string[];
}

const LOD_FACTORS = [1, 2, 3];
const NUM_LODS = LOD_FACTORS.length;

// Target max events per pixel before switching to coarser LOD
const EVENTS_PER_PIXEL_THRESHOLD = 1500;

export class TraceRenderer {
  private swimlaneRenderer: SwimlanesRenderer;
  private lookupTexture: createREGL.Texture;
  private draw: createREGL.DrawCommand;

  private cmdDurations: Float32Array = new Float32Array(256);

  // Absolute clock of the first event.
  referenceTime: number = 0;

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
        instanceViolation: {
          buffer: (ctx: any, props: DrawProps) => props.violationBuffer,
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
      cmdBuffer: lod.cmdBuffer,
      channelBuffer: lod.channelBuffer,
      bankgroupBuffer: lod.bankgroupBuffer,
      bankBuffer: lod.bankBuffer,
      violationBuffer: lod.violationBuffer,
    });
  }

  async start(stats: Stats, viewState: ViewState, signal: AbortSignal) {
    const { trace } = useBackend();

    // Grab constraint rules once upfront and strip Vue reactivity so they're
    // safe to postMessage to workers without re-serialising every batch.
    const sessionStore = useSessionStore();
    const constraintConfig = sessionStore.constraintConfig;
    const plainRules: ConstraintRule[] | null =
      constraintConfig && constraintConfig.rules.length > 0
        ? JSON.parse(JSON.stringify(constraintConfig.rules))
        : null;

    try {
      for (const lod of this.lodLevels) {
        lod.startBuffer.destroy();
        lod.cmdBuffer.destroy();
        lod.channelBuffer.destroy();
        lod.bankgroupBuffer.destroy();
        lod.bankBuffer.destroy();
        lod.violationBuffer.destroy();
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
          violationBuffer: this.regl.buffer({ length: lodCount, type: 'uint8', usage: 'dynamic' }),
          chunkIndex: [],
          loadedCount: 0,
          totalCount: lodCount,
          cpuStarts: new Float32Array(lodCount),
          cpuCmds: new Uint8Array(lodCount),
          cpuChannels: new Uint8Array(lodCount),
          cpuBankgroups: new Uint8Array(lodCount),
          cpuBanks: new Uint8Array(lodCount),
          cpuRanks: new Uint8Array(lodCount),
          cpuRows: new Int32Array(lodCount),
          cpuColumns: new Int32Array(lodCount),
          cpuViolations: new Uint8Array(lodCount),
        });
      }
      this.lookupTexture = await this.createLookupTexture();

      // Fetch the first event's absolute clock at f64 precision.
      // All GPU buffer values will be stored as (clk - referenceTime) in f32,
      // keeping values small enough for sub-cycle precision.
      this.referenceTime = await trace.getFirstEventTime();

      // Load 50k events at a time 
      const CHUNK_SIZE = 50_000;
      const START_TIME = 300;

      const firstChunk = await trace.getEntries(0, 1, this.referenceTime);
      const firstData = this.decodeTraceData(firstChunk);
      if (firstData.count > 0) {
        viewState.duration = START_TIME;
        // viewState stays in absolute time for the UI / timeline ruler.
        viewState.minTime = this.referenceTime;
        viewState.maxTime = this.referenceTime;
        // The 0.01 adds a small bit of padding to the left so we see the start of the timeline.
        viewState.start = this.referenceTime - viewState.duration * 0.01;

        for (let i = 0; i < NUM_LODS; i++) {
          // chunkIndex stores *relative* times (matching the GPU buffers).
          this.lodLevels[i]!.chunkIndex.push({ time: firstData.starts[0] ?? 0.0, offset: 0 });
        }
      }

      const lodTempStarts: Float32Array[] = LOD_FACTORS.map(f => new Float32Array(Math.ceil(CHUNK_SIZE / f)));
      const lodTempCmds: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(CHUNK_SIZE / f)));
      const lodTempChannels: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(CHUNK_SIZE / f)));
      const lodTempBankgroups: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(CHUNK_SIZE / f)));
      const lodTempBanks: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(CHUNK_SIZE / f)));
      const lodTempRanks: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(CHUNK_SIZE / f)));
      const lodTempRows: Int32Array[] = LOD_FACTORS.map(f => new Int32Array(Math.ceil(CHUNK_SIZE / f)));
      const lodTempColumns: Int32Array[] = LOD_FACTORS.map(f => new Int32Array(Math.ceil(CHUNK_SIZE / f)));
      
      // Track offsets for each LOD level separately
      const lodOffsets = new Array(NUM_LODS).fill(0);
      
      // Global index for proper decimation alignment
      let globalEventIndex = 0;

      // ── Streaming violation state ──────────────────────────────
      // Fire off a worker every VIOLATION_BATCH events.  Only one in-flight at
      // a time; data loading continues in parallel on the main thread.
      const VIOLATION_BATCH = 200_000;
      let violationWorkerBusy = false;
      let lastViolationSnapshot = 0;   // loadedCount at last worker dispatch

      // Load the chunks until we reach the end of the buffer.
      let offset = 0;
      while (offset < stats.totalEvents) {
        if (signal.aborted) break;

        const count = Math.min(CHUNK_SIZE, stats.totalEvents - offset);

        const buffer = await trace.getEntries(offset, count, this.referenceTime);
        const data = this.decodeTraceData(buffer);

        if (data.count > 0) {
          // data.starts are relative f32 values; convert the last one back to
          // absolute (f64) for viewState bounds.
          const lastAbsoluteTime = data.starts[data.count - 1]! + this.referenceTime;
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
            const tempBankgroups = lodTempBankgroups[lodIdx]!;
            const tempBanks = lodTempBanks[lodIdx]!;
            const tempRanks = lodTempRanks[lodIdx]!;
            const tempRows = lodTempRows[lodIdx]!;
            const tempColumns = lodTempColumns[lodIdx]!;
            
            let lodWriteIdx = 0;
            
            for (let i = 0; i < data.count; i++) {
              const globalIdx = globalEventIndex + i;
              if (globalIdx % factor === 0) {
                tempStarts[lodWriteIdx] = data.starts[i]!;
                tempCmds[lodWriteIdx] = data.cmds[i]!;
                tempChannels[lodWriteIdx] = data.channels[i]!;
                tempBankgroups[lodWriteIdx] = data.bankgroups[i]!;
                tempBanks[lodWriteIdx] = data.banks[i]!;
                tempRanks[lodWriteIdx] = data.ranks[i]!;
                tempRows[lodWriteIdx] = data.rows[i]!;
                tempColumns[lodWriteIdx] = data.columns[i]!;
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

              // Copy to CPU arrays for hit testing
              lod.cpuStarts.set(tempStarts.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuCmds.set(tempCmds.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuChannels.set(tempChannels.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuBankgroups.set(tempBankgroups.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuBanks.set(tempBanks.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuRanks.set(tempRanks.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuRows.set(tempRows.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              lod.cpuColumns.set(tempColumns.subarray(0, lodWriteIdx), lodOffsets[lodIdx]);
              
              lodOffsets[lodIdx] += lodWriteIdx;
              lod.loadedCount = lodOffsets[lodIdx];
            }
          }
        }

        globalEventIndex += data.count;
        offset += count;

        stats.eventCount = this.lodLevels[0]?.loadedCount ?? 0;

        const loaded = this.lodLevels[0]?.loadedCount ?? 0;
        if (plainRules && !violationWorkerBusy && loaded - lastViolationSnapshot >= VIOLATION_BATCH) {
          violationWorkerBusy = true;
          lastViolationSnapshot = loaded;
          // Fire-and-forget: the worker runs in parallel while chunks keep loading.
          this.applyViolations(plainRules).then(c => {
            stats.violationCount = c;
            violationWorkerBusy = false;
          }).catch(() => { violationWorkerBusy = false; });
        }

        await new Promise(resolve => requestAnimationFrame(resolve));
      }

      // Final violation pass covering all loaded events (catches the tail end
      // plus any cross-boundary violations missed by earlier batches).
      if (plainRules) {
        stats.violationCount = await this.applyViolations(plainRules);
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

      // Also populate `cmdDurations` for the hit testing logic.
      if (id >= 0 && id <= 255 && dur) {
        this.cmdDurations[id] = dur;
      }
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

  // Detect violations in parallel using a web worker and upload to GPU
  async applyViolations(rules: ConstraintRule[]): Promise<number> {
    if (this.lodLevels.length === 0) return 0;

    const lod0 = this.lodLevels[0]!;
    const n = lod0.loadedCount;
    if (n === 0) return 0;

    const workerData: WorkerInput = {
      data: {
        starts: lod0.cpuStarts.slice(0, n),
        cmds: lod0.cpuCmds.slice(0, n),
        channels: lod0.cpuChannels.slice(0, n),
        bankgroups: lod0.cpuBankgroups.slice(0, n),
        banks: lod0.cpuBanks.slice(0, n),
        ranks: lod0.cpuRanks.slice(0, n),
        count: n,
      },
      rules,
    };

    const { violations, count } = await new Promise<WorkerOutput>((resolve, reject) => {
      const worker = new Worker(
        new URL('./constraintWorker.ts', import.meta.url),
        { type: 'module' },
      );

      worker.onmessage = (e: MessageEvent<WorkerOutput>) => {
        worker.terminate();
        resolve(e.data);
      };

      worker.onerror = (e) => {
        worker.terminate();
        reject(new Error(`Constraint worker error: ${e.message}`));
      };

      // Transfer the copied buffers to the worker (zero-copy send).
      worker.postMessage(workerData, [
        workerData.data.starts.buffer,
        workerData.data.cmds.buffer,
        workerData.data.channels.buffer,
        workerData.data.bankgroups.buffer,
        workerData.data.banks.buffer,
        workerData.data.ranks.buffer,
      ]);
    });

    // Upload LOD 0 violations to CPU + GPU
    const violationsU8 = new Uint8Array(violations.buffer);
    lod0.cpuViolations.set(violationsU8.subarray(0, n));
    lod0.violationBuffer.subdata(violationsU8.subarray(0, n));

    // Propagate to coarser LOD levels:
    // a coarse-LOD event is flagged if ANY event in its decimation window has a violation.
    for (let lodIdx = 1; lodIdx < this.lodLevels.length; lodIdx++) {
      const coarseLod = this.lodLevels[lodIdx]!;
      const factor = LOD_FACTORS[lodIdx]!;

      for (let i = 0; i < coarseLod.loadedCount; i++) {
        const baseIdx = i * factor;
        let v = 0;
        for (let k = baseIdx; k < Math.min(baseIdx + factor, n); k++) {
          if (violationsU8[k]) { v = 1; break; }
        }
        coarseLod.cpuViolations[i] = v;
      }

      coarseLod.violationBuffer.subdata(
        coarseLod.cpuViolations.subarray(0, coarseLod.loadedCount)
      );
    }

    return count;
  }

  private decodeTraceData(input: Uint8Array | ArrayBuffer | number[]) {
    const array = input instanceof Uint8Array ? input : new Uint8Array(input as any);

    // Each entry is 17 bytes (4-byte fields first for alignment):
    //   [Start CLKs (N*4B)][Rows (N*4B)][Columns (N*4B)]
    //   [Cmd IDs (N*1B)][Channels (N*1B)][Bankgroups (N*1B)][Banks (N*1B)][Ranks (N*1B)]
    const N = array.byteLength / 17;

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
    const { numBankgroups, numBanks } = memoryLayout;
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
      const duration = this.cmdDurations[cmdId] ?? 10;
      
      // Check time intersection: event spans [eventStart, eventStart + duration]
      if (relTime < eventStart || relTime > eventStart + duration) continue;
      
      // Check Y intersection
      const channel = lod.cpuChannels[i]!;
      const bankgroup = lod.cpuBankgroups[i]!;
      const bank = lod.cpuBanks[i]!;
      
      const laneIdx = channel * (numBankgroups * numBanks) + bankgroup * numBanks + bank;
      const yCenter = swimlaneData[laneIdx * 4] ?? 0;
      
      if (Math.abs(mouseY - yCenter) <= rowHeight / 2) {
        const rank = lod.cpuRanks[i]!;
        const row = lod.cpuRows[i]!;
        const column = lod.cpuColumns[i]!;
        const violation = !!(lod.cpuViolations[i]);

        // Compute violation reasons lazily — only when hovering a violated event.
        let violationReasons: string[] = [];
        if (violation) {
          const sessionStore = useSessionStore();
          const rules = sessionStore.constraintConfig?.rules;
          if (rules && rules.length > 0) {
            violationReasons = getViolationReasons({
              starts: lod.cpuStarts,
              cmds: lod.cpuCmds,
              channels: lod.cpuChannels,
              bankgroups: lod.cpuBankgroups,
              banks: lod.cpuBanks,
              ranks: lod.cpuRanks,
              count: lod.loadedCount,
            }, i, rules);
          }
        }

        return { eventIndex: i, start: eventStart, duration, cmdId, channel, bankgroup, bank, rank, row, column, violation, violationReasons };
      }
    }
    
    return null;
  }

  // Jump to the next violation after the current view center
  findNextViolation(relTime: number): number | null {
    if (this.lodLevels.length === 0) return null;
    const lod = this.lodLevels[0]!;
    const startIdx = this.bisectRightStarts(lod.cpuStarts, relTime, lod.loadedCount);

    for (let i = startIdx; i < lod.loadedCount; i++) {
      if (lod.cpuViolations[i]) {
        return lod.cpuStarts[i]! + this.referenceTime;
      }
    }
    return null;
  }

  // Jump to the previous violation before the current view center
  findPrevViolation(relTime: number): number | null {
    if (this.lodLevels.length === 0) return null;
    const lod = this.lodLevels[0]!;
    const endIdx = this.bisectRightStarts(lod.cpuStarts, relTime, lod.loadedCount);

    for (let i = endIdx - 1; i >= 0; i--) {
      if (lod.cpuViolations[i]) {
        return lod.cpuStarts[i]! + this.referenceTime;
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