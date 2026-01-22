// This file implements the WebGL rendering logic for the trace view.
// ----
// Author: Ziad Malik
// Email: zmalik@ethz.ch
// ----

import createREGL from 'regl';
import { getTraceView } from '~/lib/backend';

const vert = `
precision mediump float;

// The "Stamp" vertices (0,0) to (1,1)
attribute vec2 position;

// Per-Instance Data (The "List")
attribute float instanceStart;
attribute float instanceDuration;
attribute float instanceRow;
attribute vec3 instanceColor;

// Global View Settings (Zoom/Pan)
uniform vec2 u_viewRange; // [start_clk, end_clk]
uniform float u_rowHeight;
uniform vec2 u_resolution;

varying vec3 vColor;

void main() {
  // Pass color to the fragment shader
  vColor = instanceColor;

  // 1. Calculate World Position
  // X = Start Time + (Width * 0 or 1)
  float worldX = instanceStart + (position.x * instanceDuration);
  
  // Y = Row Index + (Height * 0 or 1)
  float worldY = instanceRow + position.y;

  // 2. Convert to Normalized Device Coordinates (-1.0 to 1.0)
  float viewWidth = u_viewRange.y - u_viewRange.x;
  
  // Map X to -1..1
  float ndcX = ((worldX - u_viewRange.x) / viewWidth) * 2.0 - 1.0;

  // Map Y to -1..1 (Flip Y because WebGL 0,0 is bottom-left)
  float ndcY = 1.0 - (worldY * u_rowHeight * 2.0 / u_resolution.y);

  gl_Position = vec4(ndcX, ndcY, 0, 1);
}
`;

const frag = `
precision mediump float;
varying vec3 vColor;

void main() {
  // Just paint the pixel with the interpolated color
  gl_FragColor = vec4(vColor, 1.0);
}
`;

export const useRenderer = (canvas: Ref<HTMLCanvasElement | null>) => {
  let regl: createREGL.Regl | null = null;

  onMounted(async () => {
    if (!canvas.value) return;

    try {
      const traceData = await getTraceView(0, 100)

      regl = createREGL({
        canvas: canvas.value,
        attributes: { antialias: true },
        extensions: ['angle_instanced_arrays']
      });

      const startBuffer = regl.buffer(traceData.starts);
      const durationBuffer = regl.buffer(traceData.durations);
      const rowBuffer = regl.buffer(traceData.rows);
      const colorBuffer = regl.buffer(traceData.colors);

      let draw = regl({
        vert,
        frag,

        attributes: {
          // The "Stamp": A unit square (2 triangles)
          position: [
            [0, 0], [1, 0], [0, 1], // Triangle 1
            [0, 1], [1, 0], [1, 1]  // Triangle 2
          ],
          // The Data: Hook up your buffers
          instanceStart: { buffer: startBuffer, divisor: 1 },
          instanceDuration: { buffer: durationBuffer, divisor: 1 },
          instanceRow: { buffer: rowBuffer, divisor: 1 },
          instanceColor: { buffer: colorBuffer, divisor: 1 },

        },

        uniforms: {
        // @ts-ignore - TODO(ziad): figure out prop typing.
        u_viewRange: regl.prop('viewRange'), 
        u_rowHeight: 20.0, 
        u_resolution: ctx => [ctx.viewportWidth, ctx.viewportHeight]
      },

      instances: traceData.starts.length,
      count: 6 
      })

      const minTime = traceData.starts[0] ?? 0;
      const maxTime = (traceData.starts[traceData.starts.length - 1] ?? 0) + 100;

      regl?.frame(() => {
        regl?.clear({
          color: [0.1, 0.1, 0.1, 1],
          depth: 1
        })

        draw({ viewRange: [minTime, maxTime] })
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
};
