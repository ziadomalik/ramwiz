// This file implements the WebGL rendering logic for the trace view.
// ----
// Author: Ziad Malik
// Email: zmalik@ethz.ch
// ----

import createREGL from 'regl';
import type { CommandConfig } from '@/composables/useBackend';
import { useUIStore } from '~/stores/ui';

const gridVert = `
precision mediump float;
attribute vec2 position;
attribute float yScreen;

uniform float u_resolution_y;

void main() {
  float thickness = 0.25; 

  // yScreen is the top edge of the line in screen pixels relative to canvas top
  // TODO(ziad): The 4.0 just makes it align with the accordion menu items, idk how to do this automatically.
  float finalY = yScreen + (position.y - 4.0) * thickness;
  
  // Convert to NDC. Screen Y=0 -> NDC=1, Screen Y=H -> NDC=-1
  float ndcY = 1.0 - (finalY / u_resolution_y) * 2.0;
  
  // X is 0..1 -> -1..1
  float ndcX = position.x * 2.0 - 1.0;
  
  gl_Position = vec4(ndcX, ndcY, 0, 1);
}
`

const gridFrag = `
precision mediump float;
void main() {
  // TODO(ziad): Match color the scheme.
  gl_FragColor = vec4(0.3, 0.3, 0.3, 1.0);
}
`

const vert = `
precision mediump float;
attribute vec2 position;

attribute float instanceStart;
attribute float instanceCmdId; 

uniform sampler2D u_lookupTable; 
uniform vec2 u_viewRange; 
uniform float u_rowHeight;
uniform vec2 u_resolution;

varying vec3 vColor;

void main() {
  // Map Command ID to Texture U coordinate (0..1)
  // We sample from the center of the pixel: (id + 0.5) / 256.0
  vec2 uv = vec2((instanceCmdId + 0.5) / 256.0, 0.5);
  vec4 properties = texture2D(u_lookupTable, uv);
  
  vec3 color = properties.rgb;
  // We're storing the clock period in the alpha channel lol. 
  float duration = properties.a; 

  vColor = color;

  float viewWidth = u_viewRange.y - u_viewRange.x;

  float worldX = instanceStart + (position.x * duration);
  
  // TODO(ziad):  Figure out how to handle different rows (e.g. row is passed as a uniform if const).
  float row = 0.0; 
  float worldY = row + position.y;

  float ndcX = ((worldX - u_viewRange.x) / viewWidth) * 2.0 - 1.0;
  float ndcY = 1.0 - (worldY * u_rowHeight * 2.0 / u_resolution.y);

  gl_Position = vec4(ndcX, ndcY, 0, 1);
}
`

const frag = `
precision mediump float;
varying vec3 vColor;

void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`;

function createLookupTexture(regl: createREGL.Regl, config: CommandConfig) {
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

  return regl.texture({
    width: 256,
    height: 1,
    data: data,
    format: 'rgba',
    type: 'float',
    min: 'nearest',
    mag: 'nearest'
  });
}

function decodeTraceData(input: Uint8Array | ArrayBuffer | number[]) {
  const array = input instanceof Uint8Array ? input : new Uint8Array(input as any);

  // Each entry is 5 bytes: 4 bytes for start + 1 byte for cmd id.
  const N = array.byteLength / 5;
  const startBytes = N * 4;

  const startView = new Float32Array(array.buffer, array.byteOffset, N);
  const cmdView = new Uint8Array(array.buffer, array.byteOffset + startBytes, N);

  return { starts: startView, cmds: cmdView, count: N };
}

interface DrawProps {
  viewRange: [number, number];
  offset: number;
  instances: number;
  startBuffer: createREGL.Buffer;
  cmdBuffer: createREGL.Buffer;
}

const LOD_FACTORS = [1, 2, 3];
const NUM_LODS = LOD_FACTORS.length;

// Target max events per pixel before switching to coarser LOD
const EVENTS_PER_PIXEL_THRESHOLD = 1500;

interface LODLevel {
  startBuffer: createREGL.Buffer;
  cmdBuffer: createREGL.Buffer;
  chunkIndex: { time: number; offset: number }[];
  loadedCount: number;
  totalCount: number;
}

export function useRenderer(canvas: Ref<HTMLCanvasElement | null>) {
  const uiStore = useUIStore();
  const { trace, store } = useBackend();

  let regl: createREGL.Regl | null = null;

  const lodLevels: LODLevel[] = [];

  let lookupTexture: createREGL.Texture;

  let abortController: AbortController | null = null;

  const viewState = reactive({
    start: 0,
    scrollY: 0,
    duration: 100,
    minDuration: 100,
    maxDuration: 1200,

    // Boundaries for the time range.
    minTime: 0,
    maxTime: 1000,
    viewRange: [0, 0],
  })

  const stats = reactive({
    fps: 0,
    eventCount: 0,
    totalEvents: 0,
    progress: 0,
    currentLod: "",
    instancesDrawn: 0,
  })

  // Handlers for the timeline bounds.

  const clampViewStart = (s: number) => {
    const padding = viewState.duration * 0.1;
    const min = viewState.minTime - padding;

    // Ensure we don't clamp past the max if zoomed out far
    const max = Math.max(min, viewState.maxTime - viewState.duration + padding);
    return Math.max(min, Math.min(s, max));
  }

  // Handlers for zooming and panning.

  const handleMouseWheel = (event: WheelEvent) => {
    if (!canvas.value) return;

    const rect = canvas.value.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const width = rect.width;

    // Calculate the time range at the mouse position.
    const timeAtMouse = viewState.start + (mouseX / width) * viewState.duration;

    // Zoom in 10% increments
    const zoomFactor = 1.1;

    if (event.deltaY > 0) {
      viewState.duration *= zoomFactor; // Zoom Out
    } else {
      viewState.duration /= zoomFactor; // Zoom In
    }

    viewState.duration = Math.max(viewState.minDuration, Math.min(viewState.duration, viewState.maxDuration));

    // Make sure that the time wherever the mouse is remains included in the view.
    const newStart = timeAtMouse - (mouseX / width) * viewState.duration;
    viewState.start = clampViewStart(newStart);
  }

  let isDragging = false;
  let lastX = 0;

  const handleMouseDown = (e: MouseEvent) => {
    isDragging = true;
    lastX = e.clientX;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !canvas.value) return;

    const dx = e.clientX - lastX;
    lastX = e.clientX;

    const rect = canvas.value.getBoundingClientRect();
    // Fraction of screen moved * time duration = time shifted
    const dt = -(dx / rect.width) * viewState.duration;

    viewState.start = clampViewStart(viewState.start + dt);
  };

  const handleMouseUp = () => {
    isDragging = false;
  };

  const resize = () => {
    if (canvas.value) {
      const rect = canvas.value.getBoundingClientRect();
      canvas.value.width = rect.width;
      canvas.value.height = rect.height;
      regl?.poll()
    }
  }

  onUnmounted(() => {
    if (regl) {
      regl.destroy()
    }

    if (abortController) {
      abortController.abort();
    }

    if (canvas.value) {
      canvas.value.removeEventListener('wheel', handleMouseWheel);
      canvas.value.removeEventListener('mousedown', handleMouseDown);
    }
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('resize', resize);
  });

  const startStream = async () => {
    if (!regl) return;
    if (abortController) {
      abortController.abort();
    }

    abortController = new AbortController();
    const signal = abortController.signal;

    try {
      lodLevels.length = 0;

      const header = await trace.getHeader();
      if (!header) return;

      const totalEntries = header.num_entries;
      stats.totalEvents = totalEntries;

      for (let i = 0; i < NUM_LODS; i++) {
        const factor = LOD_FACTORS[i]!;
        const lodCount = Math.ceil(totalEntries / factor);
        
        lodLevels.push({
          startBuffer: regl.buffer({ length: lodCount * 4, type: 'float', usage: 'dynamic' }),
          cmdBuffer: regl.buffer({ length: lodCount, type: 'uint8', usage: 'dynamic' }),
          chunkIndex: [],
          loadedCount: 0,
          totalCount: lodCount
        });
      }

      const config = await store.loadCommandConfig();

      if (config) {
        lookupTexture = createLookupTexture(regl, config);
      }

      // Load 50k events at a time 
      const CHUNK_SIZE = 50_000;
      const START_TIME = 300;

      const firstChunk = await trace.getEntries(0, 1);
      const firstData = decodeTraceData(firstChunk);
      if (firstData.count > 0) {
        viewState.duration = START_TIME;
        // The 0.01 adds a small bit of padding to the left so we see the start of the timeline.
        viewState.start = -viewState.duration * 0.01;

        for (let i = 0; i < NUM_LODS; i++) {
          lodLevels[i]!.chunkIndex.push({ time: firstData.starts[0] ?? 0.0, offset: 0 });
        }
      }

      const lodTempStarts: Float32Array[] = LOD_FACTORS.map(f => new Float32Array(Math.ceil(CHUNK_SIZE / f)));
      const lodTempCmds: Uint8Array[] = LOD_FACTORS.map(f => new Uint8Array(Math.ceil(CHUNK_SIZE / f)));
      
      // Track offsets for each LOD level separately
      const lodOffsets = new Array(NUM_LODS).fill(0);
      
      // Global index for proper decimation alignment
      let globalEventIndex = 0;

      // Load the chunks until we reach the end of the buffer.
      let offset = 0;
      while (offset < totalEntries) {
        if (signal.aborted) break;

        const count = Math.min(CHUNK_SIZE, totalEntries - offset);

        const buffer = await trace.getEntries(offset, count);
        const data = decodeTraceData(buffer);

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
            const lod = lodLevels[lodIdx]!;
            const tempStarts = lodTempStarts[lodIdx]!;
            const tempCmds = lodTempCmds[lodIdx]!;
            
            let lodWriteIdx = 0;
            
            for (let i = 0; i < data.count; i++) {
              const globalIdx = globalEventIndex + i;
              if (globalIdx % factor === 0) {
                tempStarts[lodWriteIdx] = data.starts[i]!;
                tempCmds[lodWriteIdx] = data.cmds[i]!;
                lodWriteIdx++;
              }
            }

            if (lodWriteIdx > 0) {
              if (lodOffsets[lodIdx] > 0 && offset > 0) {
                lod.chunkIndex.push({ time: tempStarts[0]!, offset: lodOffsets[lodIdx] });
              }

              lod.startBuffer.subdata(tempStarts.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 4);
              lod.cmdBuffer.subdata(tempCmds.subarray(0, lodWriteIdx), lodOffsets[lodIdx] * 1);
              
              lodOffsets[lodIdx] += lodWriteIdx;
              lod.loadedCount = lodOffsets[lodIdx];
            }
          }
        }

        globalEventIndex += data.count;
        offset += count;

        stats.progress = offset / totalEntries;
        stats.eventCount = lodLevels[0]?.loadedCount ?? 0;

        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    } catch (error) {
      console.log('Streaming Error: ', error);
    }
  }

  onMounted(async () => {
    if (!canvas.value) return;

    try {
      regl = createREGL({
        canvas: canvas.value,
        attributes: { antialias: true },
        extensions: ['angle_instanced_arrays', 'oes_texture_float']
      });

      // Initialize lookup texture to dummy value
      lookupTexture = regl.texture({ width: 1, height: 1 });

      const gridBuffer = regl.buffer({ length: 0, type: 'float', usage: 'dynamic' });
      const drawGrid = regl({
        vert: gridVert,
        frag: gridFrag,
        attributes: {
          position: [[0, 0], [1, 0], [0, 1], [0, 1], [1, 0], [1, 1]],
          yScreen: {
            buffer: gridBuffer,
            divisor: 1
          }
        },
        uniforms: {
          u_resolution_y: (ctx: any) => ctx.viewportHeight
        },
        instances: (ctx: any, props: any) => props.count,
        count: 6
      });

      let draw = regl<any, any, DrawProps>({
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
        },

        uniforms: {
          u_viewRange: regl.prop<DrawProps, 'viewRange'>('viewRange'),
          u_rowHeight: 20.0,
          u_resolution: (ctx: any) => [ctx.viewportWidth, ctx.viewportHeight],
          u_lookupTable: () => lookupTexture
        },

        instances: (ctx: any, props: DrawProps) => props.instances,
        count: 6
      })

      let frameCount = 0;
      let lastFpsUpdate = performance.now();

      regl?.frame(() => {
        // I am hardcoding the tailwind bg-zinc-900 color to the background color.
        // TODO(ziad): This should be dynamic to support other color modes + themes in the future.
        const backgroundColor = [24, 24, 27, 255].map(x => x / 255) as [number, number, number, number];
        regl?.clear({ color: backgroundColor, depth: 1 });

        // Draw grid lines
        if (canvas.value && uiStore.rowLayout.length > 0) {
          const canvasRect = canvas.value.getBoundingClientRect();
          const rows = uiStore.rowLayout;

          const lines = new Float32Array(rows.length * 2);
          let count = 0;
          
          // The UTree items contain a ul element with child items, we take it's bottom edge and render the grid line there.
          for (let i = 0; i < rows.length; i++) {
             const row = rows[i];
             if (row) {
                lines[count++] = row.top + row.height - canvasRect.top;
             }
          }
          
          gridBuffer(lines.subarray(0, count));
          drawGrid({ count: count });
        }

        const viewStart = viewState.start;
        const viewEnd = viewState.start + viewState.duration;

        // Skip rendering if no LOD levels are loaded
        if (lodLevels.length === 0 || lodLevels[0]!.loadedCount === 0) {
          frameCount++;
          const now = performance.now();
          if (now - lastFpsUpdate >= 1000) {
            stats.fps = Math.round(frameCount * 1000 / (now - lastFpsUpdate));
            frameCount = 0;
            lastFpsUpdate = now;
          }
          return;
        }

        // Select appropriate LOD based on events per pixel
        const lod0 = lodLevels[0]!;
        let estimatedEventsInView = lod0.loadedCount;
        
        let viewStartOffset = 0;
        let viewEndOffset = lod0.loadedCount;
        
        for (let i = 0; i < lod0.chunkIndex.length; i++) {
          if (lod0.chunkIndex[i]!.time > viewStart) break;
          viewStartOffset = lod0.chunkIndex[i]!.offset;
        }
        for (let i = 0; i < lod0.chunkIndex.length; i++) {
          if (lod0.chunkIndex[i]!.time > viewEnd) {
            viewEndOffset = lod0.chunkIndex[i]!.offset;
            break;
          }
        }
        estimatedEventsInView = viewEndOffset - viewStartOffset;

        const canvasWidth = canvas.value?.width ?? 1920;
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

        const lod = lodLevels[selectedLod]!;
        const chunkIndex = lod.chunkIndex;
        const loadedCount = lod.loadedCount;

        let startOffset = 0;
        let endOffset = loadedCount;

        for (let i = 0; i < chunkIndex.length; i++) {
          if (chunkIndex[i]!.time > viewStart) {
            break;
          }
          startOffset = chunkIndex[i]!.offset;
        }

        for (let i = 0; i < chunkIndex.length; i++) {
          if (chunkIndex[i]!.time > viewEnd) {
            endOffset = chunkIndex[i]!.offset;
            break;
          }
          if (i === chunkIndex.length - 1) {
            endOffset = loadedCount;
          }
        }

        const count = Math.max(0, endOffset - startOffset);

        stats.currentLod = `1:${LOD_FACTORS[selectedLod] ?? 1}`;
        stats.instancesDrawn = count;

        draw({
          viewRange: [viewStart, viewEnd],
          offset: startOffset,
          instances: count,
          startBuffer: lod.startBuffer,
          cmdBuffer: lod.cmdBuffer
        });

        frameCount++;
        const now = performance.now();
        if (now - lastFpsUpdate >= 1000) {
          stats.fps = Math.round(frameCount * 1000 / (now - lastFpsUpdate));
          frameCount = 0;
          lastFpsUpdate = now;
        }
      });

      // Add listeners
      if (canvas.value) {
        canvas.value.addEventListener('wheel', handleMouseWheel, { passive: false });
        canvas.value.addEventListener('mousedown', handleMouseDown);
      }
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('resize', resize);
      resize();

      startStream();

    } catch (error) {
      console.error('Error initializing REGL:', error);
    }
  });

  return { stats, viewState }
};
