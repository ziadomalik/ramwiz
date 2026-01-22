<template>
  <canvas ref="canvasRef" width="800" height="600" />
</template>

<script setup lang="ts">
import createREGL from 'regl';

const canvasRef = ref<HTMLCanvasElement | null>(null);

onMounted(() => {
  if (!canvasRef.value) {
    throw new Error('Canvas not found');
  }

  const regl = createREGL(canvasRef.value);

  const drawTriangle = regl({
    frag: `
      precision mediump float;
      uniform vec4 color;
      void main() {
        gl_FragColor = color;
      }`,

    vert: `
      precision mediump float;
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0, 1);
      }`,

    attributes: {
      position: [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0, 0.5]
      ]
    },

    uniforms: {
      color: regl.prop<{ color: number[] }, 'color'>('color')
    },

    count: 3
  });

  regl.frame(({ time }) => {
    regl.clear({
      color: [0, 0, 0, 1],
      depth: 1
    });

    drawTriangle({
      color: [
        Math.cos(time),
        Math.sin(time * 0.8),
        Math.cos(time * 0.3),
        1
      ]
    });
  });
});
</script>