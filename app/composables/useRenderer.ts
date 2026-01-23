// This file implements the WebGL rendering logic for the trace view.
// ----
// Author: Ziad Malik
// Email: zmalik@ethz.ch
// ----

import createREGL from 'regl';
import { getEntryIndexByTime, getTraceView } from '~/lib/backend';

const vert = `
precision mediump float;
attribute vec2 position;

attribute float instanceRow;
attribute vec3 instanceColor;
attribute float instanceStart;
attribute float instanceDuration;

uniform vec2 u_viewRange; 
uniform float u_rowHeight;
uniform vec2 u_resolution;

varying vec3 vColor;

void main() {
  vColor = instanceColor;

  float viewWidth = u_viewRange.y - u_viewRange.x;
  float screenWidthPx = (instanceDuration / viewWidth) * u_resolution.x;

  // NOTE: This doesn't render small events, but the data is still fetched and decoded.
  // TODO(ziad): Decide on a good value for this, it tends to make events dissapear too early. 
  if (screenWidthPx < 0.005) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float worldX = instanceStart + (position.x * instanceDuration);
  
  float worldY = instanceRow + position.y;
  float ndcX = ((worldX - u_viewRange.x) / viewWidth) * 2.0 - 1.0;
  float ndcY = 1.0 - (worldY * u_rowHeight * 2.0 / u_resolution.y);

  gl_Position = vec4(ndcX, ndcY, 0, 1);
}`

const frag = `
precision mediump float;
varying vec3 vColor;

void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`;

  function decodeTraceData(input: Uint8Array | ArrayBuffer | number[]) {
    let array: Uint8Array 

    if (input instanceof Uint8Array) {
      array = input;
    } else {
      // Handle ArrayBuffer or number[] or fallback
      array = new Uint8Array(input as any);
    }
  
    const floatView = new Float32Array(array.buffer, array.byteOffset, array.byteLength / 4);
    
    // Calculate total items. 
    // Each item has: 1 start + 1 duration + 1 row + 3 colors = 6 floats.
    const N = floatView.length / 6;

    const starts = floatView.subarray(0, N);
    const durations = floatView.subarray(N, 2 * N);
    const rows = floatView.subarray(2 * N, 3 * N);
    const colors = floatView.subarray(3 * N, 6 * N);
    
    return { 
      starts, 
      durations, 
      rows, 
      colors, 
      count: N,
    };
  }

interface DrawProps {
  viewRange: [number, number];
}

export const useRenderer = (canvas: Ref<HTMLCanvasElement | null>) => {
  let regl: createREGL.Regl | null = null;

  // Buffers for the instance data.
  let rowBuffer: createREGL.Buffer
  let colorBuffer: createREGL.Buffer
  let startBuffer: createREGL.Buffer
  let durationBuffer: createREGL.Buffer

  // Number of trace events to render.
  let instanceCount = 0;

  // State for culling.
  let loadedEndVal = 0;
  let loadedStartVal = 0;
  let isFetching = false;
  let pendingUpdate = false;

  const viewState = reactive({
    start: 0,
    scrollY: 0,
    duration: 100,
    minDuration: 100,
    maxDuration: 1e9,
  })

  const stats = reactive({
    fps: 0,
    eventCount: 0,
  })

  const updateData = async () => {
    if (!regl) return;

    if (isFetching) {
      pendingUpdate = true;
      return;
    }

    const currentStart = viewState.start;
    const currentEnd = viewState.start + viewState.duration;

    // We prefetch 1 screen ahead and 1 screen behind.
    const threshold = viewState.duration * 1.0;
    
    // Check if we have enough buffer.
    const hasLeftBuffer = (currentStart - loadedStartVal) > threshold;
    const hasRightBuffer = (loadedEndVal - currentEnd) > threshold;

    if (hasLeftBuffer && hasRightBuffer) {
      return;
    }

    try {
      isFetching = true;

      // Load a huge chunk centered on current view.
      // TODO(ziad): After I manage to integrate culling into the fetch logic, I think I can reduce this to a smaller number.
      const lookahead = viewState.duration * 5.0;
      
      const fetchStartClk = currentStart - lookahead;
      const fetchEndClk = currentEnd + lookahead;

      const startIndex = await getEntryIndexByTime(fetchStartClk);
      const endIndex = await getEntryIndexByTime(fetchEndClk);

      // TODO(ziad): This will be irrelevant once culling logic is done.
      const MAX_ENTRIES = 10000000;
      const count = Math.max(0, Math.min(endIndex - startIndex, MAX_ENTRIES));

      if (count > 0) {
        const buffer = await getTraceView(startIndex, count)
        const data = decodeTraceData(buffer);

        if (data.starts.length > 0) {
          rowBuffer(data.rows);
          colorBuffer(data.colors);
          startBuffer(data.starts);
          durationBuffer(data.durations);

          instanceCount = data.starts.length;
          loadedStartVal = data.starts[0] ?? 0;
          loadedEndVal = data.starts[data.starts.length - 1] ?? 0;
        }
      }
    } catch (error) {
      console.error('Error updating data:', error);
    } finally {
      isFetching = false;
      if (pendingUpdate) {
        pendingUpdate = false;
        requestUpdate();
      }
    }
  }

  let debounceTimer: any = null;
  const requestUpdate = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateData, 100);
  };


  onMounted(async () => {
    if (!canvas.value) return;

    try {
      // Initialize rendering logic:
      // ---------------------------

      const bytes = await getTraceView(0, 10000);
      const traceData = decodeTraceData(bytes);

      regl = createREGL({
        canvas: canvas.value,
        attributes: { antialias: true },
        extensions: ['angle_instanced_arrays']
      });

      startBuffer = regl.buffer(traceData.starts);
      durationBuffer = regl.buffer(traceData.durations);
      rowBuffer = regl.buffer(traceData.rows);
      colorBuffer = regl.buffer(traceData.colors);

      if (traceData.starts.length > 0) {
        instanceCount = traceData.starts.length;

        loadedStartVal = traceData.starts[0] ?? 0;
        loadedEndVal = traceData.starts[traceData.starts.length - 1] ?? 0;

        viewState.start = loadedStartVal;
        viewState.duration = (loadedEndVal - loadedStartVal) * 0.1;
      }

      let draw = regl({
        vert,
        frag,

        attributes: {
          position: [[0, 0], [1, 0], [0, 1], [0, 1], [1, 0], [1, 1]],
          instanceStart: { buffer: startBuffer, divisor: 1 },
          instanceDuration: { buffer: durationBuffer, divisor: 1 },
          instanceRow: { buffer: rowBuffer, divisor: 1 },
          instanceColor: { buffer: colorBuffer, divisor: 1 },
        },

        uniforms: {
          u_viewRange: regl.prop<DrawProps, 'viewRange'>('viewRange'),
          u_rowHeight: 20.0,
          u_resolution: ctx => [ctx.viewportWidth, ctx.viewportHeight]
        },

        instances: () => instanceCount,
        count: 6
      })

      // Initialize view state:
      // ----------------------

      if (traceData.starts.length > 0) {
        viewState.start = traceData.starts[0] ?? 0;
        viewState.duration = ((traceData.starts[traceData.starts.length - 1] ?? 0) - (traceData.starts[0] ?? 0)) * 0.1;
      }

      // Initialize frame loop:
      // ----------------------

      let frameCount = 0;
      let lastFpsUpdate = performance.now();

      regl?.frame(() => {
        regl?.clear({
          color: [0.1, 0.1, 0.1, 1],
          depth: 1
        })

        draw({ viewRange: [viewState.start, viewState.start + viewState.duration] })

        frameCount++;
        const now = performance.now();
        if (now - lastFpsUpdate >= 1000) {
          stats.fps = Math.round(frameCount * 1000 / (now - lastFpsUpdate));
          frameCount = 0;
          lastFpsUpdate = now;
        }

        stats.eventCount = instanceCount;
      });

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
        viewState.start = timeAtMouse - (mouseX / width) * viewState.duration;

        requestUpdate();
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

        viewState.start += dt;

        requestUpdate();
      };

      const handleMouseUp = () => {
        isDragging = false;
      };

      if (canvas.value) {
        canvas.value.addEventListener('wheel', handleMouseWheel, { passive: false });
        canvas.value.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
      }

      onUnmounted(() => {
        if (canvas.value) {
          canvas.value.removeEventListener('wheel', handleMouseWheel);
          canvas.value.removeEventListener('mousedown', handleMouseDown);
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
        }
      })
    } catch (error) {
      console.error('Error initializing REGL:', error);
    }

    const resize = () => {
      if (canvas.value) {
        canvas.value.width = window.innerWidth
        canvas.value.height = window.innerHeight
        regl?.poll()
      }
    }

    window.addEventListener('resize', resize)
    resize()

    onUnmounted(() => {
      window.removeEventListener('resize', resize)
    })
  });

  onUnmounted(() => {
    if (regl) {
      regl.destroy()
    }
  });

  return { stats, viewState }
};
