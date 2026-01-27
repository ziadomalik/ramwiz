<template>
  <div ref="container" class="w-full h-8 bg-neutral-900 border-t border-neutral-800 select-none">
    <canvas ref="canvas" class="block w-full h-full" />
  </div>
</template>

<script setup lang="ts">
interface ViewState {
  start: number;
  minTime: number;
  maxTime: number;
  duration: number;
}

const props = defineProps<{
  viewState: ViewState;
}>();

const container = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

function formatTick(value: number, step: number): string {
  const abs = Math.abs(value);

  if (abs >= 1e9 && step >= 1e8) return (value / 1e9).toFixed(1) + 'G';
  if (abs >= 1e6 && step >= 1e5) return (value / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3 && step >= 1e2) return (value / 1e3).toFixed(1) + 'k';

  const decimalPlaces = step >= 1 ? 0 : Math.ceil(-Math.log10(step));
  
  return value.toFixed(decimalPlaces);
}

function getStepSize(duration: number, width: number) {
  const targetPixelsPerTick = 100;
  const targetStep = duration * (targetPixelsPerTick / width);
  const power = Math.floor(Math.log10(targetStep));
  const base = Math.pow(10, power);
  const multipliers = [1, 2, 5, 10];
  
  for (const m of multipliers) {
    if (base * m >= targetStep) return base * m;
  }
  return base * 10;
}

const draw = () => {
  if (!canvas.value || !container.value) return;
  const ctx = canvas.value.getContext('2d');
  if (!ctx) return;

  const width = container.value.clientWidth;
  const height = container.value.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  // Resize the canvas if the dimensions have changed.
  if (canvas.value.width !== width * dpr || canvas.value.height !== height * dpr) {
    canvas.value.width = width * dpr;
    canvas.value.height = height * dpr;
    ctx.scale(dpr, dpr);
  }

  ctx.clearRect(0, 0, width, height);

  const { start, duration } = props.viewState;
  
  const step = getStepSize(duration, width);

  const startTick = Math.ceil(start / step) * step;
  const endTick = start + duration;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#52525c';
  ctx.font = '10px "Jetbrains Mono", monospace';
  ctx.beginPath();
  ctx.strokeStyle = '#52525c';
  ctx.lineWidth = 1;

  const epsilon = step / 1000;

  for (let tick = startTick; tick < endTick + epsilon; tick += step) {
    if (tick < props.viewState.minTime || tick > props.viewState.maxTime) continue;
    
    const x = ((tick - start) / duration) * width;

    ctx.moveTo(x, 0);
    ctx.lineTo(x, 6);

    ctx.fillText(formatTick(tick, step), x + 4, 4);
  }

  ctx.stroke();
}

// Redraw when the view state changes.
watch(() => props.viewState, draw, { deep: true });

let resizeObserver: ResizeObserver;
onMounted(() => {
  if (container.value) {
    resizeObserver = new ResizeObserver(() => {
      draw();
    });
    resizeObserver.observe(container.value);
  }
  draw();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});
</script>