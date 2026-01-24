// This file implements the WebGL rendering logic for the trace view.
// ----
// Author: Ziad Malik
// Email: zmalik@ethz.ch
// ----

import createREGL from 'regl';
import { getSessionInfoHandler, getTraceView, loadCommandConfig } from '~/lib/backend';
import type { CommandConfig } from '~/lib/backend';

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
}

export const useRenderer = (canvas: Ref<HTMLCanvasElement | null>) => {
  let regl: createREGL.Regl | null = null;

  // Buffers for the instance data.
  let startBuffer: createREGL.Buffer;
  let cmdBuffer: createREGL.Buffer;
  let lookupTexture: createREGL.Texture;

  // We maintain a list of chunks and their offsets so we dont have to iterate over the entire buffer when drawing.
  // We store the time of the chunk and the offset of the first event in the chunk.
  const chunkIndex: { time: number, offset: number }[] = [];

  let loadedCount = 0;
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
      canvas.value.width = window.innerWidth
      canvas.value.height = window.innerHeight
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
      loadedCount = 0;
      chunkIndex.length = 0;

      const header = await getSessionInfoHandler();
      if (!header) return;

      const totalEntries = header.num_entries;
      stats.totalEvents = totalEntries;

      // We allocate the full number of entries on the GPU immediately. (i.e. 4 bytes for start, 1 byte for cmd)
      startBuffer = regl.buffer({ length: totalEntries * 4, type: 'float', usage: 'dynamic' });
      cmdBuffer = regl.buffer({ length: totalEntries, type: 'uint8', usage: 'dynamic' });

      const config = await loadCommandConfig();

      if (config) {
        lookupTexture = createLookupTexture(regl, config);
      }

      // Load 100k events at a time 
      const CHUNK_SIZE = 50_000;
      const START_TIME = 300;

      const firstChunk = await getTraceView(0, 1);
      const firstData = decodeTraceData(firstChunk);
      if (firstData.count > 0) {
        viewState.duration = START_TIME;
        // The 0.01 adds a small bit of padding to the left so we see the start of the timeline.
        viewState.start = -viewState.duration * 0.01;

        chunkIndex.push({ time: firstData.starts[0] ?? 0.0, offset: 0 });
      }

      // Load the chunks until we reach the end of the buffer.
      let offset = 0;
      while (offset < totalEntries) {
        if (signal.aborted) break;

        const count = Math.min(CHUNK_SIZE, totalEntries - offset);

        const buffer = await getTraceView(offset, count);
        const data = decodeTraceData(buffer);

        if (data.count > 0) {
          if (offset > 0) {
            chunkIndex.push({ time: data.starts[0]!, offset: offset });
          }

          // Update the max time if we've seen a new event.
          const lastTime = data.starts[data.count - 1]!;
          if (lastTime > viewState.maxTime) {
            viewState.maxTime = lastTime;

            // Limit max zoom to the full trace range + 20% padding on each side.
            viewState.maxDuration = (viewState.maxTime - viewState.minTime) * 1.2;
          }
        }

        startBuffer.subdata(data.starts, offset * 4);
        cmdBuffer.subdata(data.cmds, offset * 1);

        offset += count;
        loadedCount = offset;

        stats.progress = loadedCount / totalEntries;
        stats.eventCount = loadedCount;

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

      // Need to initialize these to dummy values to avoid errors.
      startBuffer = regl.buffer(0);
      cmdBuffer = regl.buffer(0);
      lookupTexture = regl.texture({ width: 1, height: 1 });

      let draw = regl<any, any, DrawProps>({
        vert,
        frag,

        attributes: {
          position: [[0, 0], [1, 0], [0, 1], [0, 1], [1, 0], [1, 1]],
          instanceStart: {
            buffer: () => startBuffer,
            divisor: 1,
            offset: (ctx: any, props: DrawProps) => props.offset * 4
          },
          instanceCmdId: {
            buffer: () => cmdBuffer,
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

        const viewStart = viewState.start;
        const viewEnd = viewState.start + viewState.duration;

        // The culling logic is as follows:
        // 1. Find the start and end offsets of the chunk that contains the view range.
        // 2. Draw the chunk.
        // 3. Repeat for the next chunk until we reach the end of the buffer.

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

        draw({
          viewRange: [viewStart, viewEnd],
          offset: startOffset,
          instances: count
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
