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

function formatTick(value: number): string {
  if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(1) + 'G';
  if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(1) + 'k';
  return value.toFixed(0);
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
  if (!canvas.value || !container.value) {
    return;
  }

  const ctx = canvas.value.getContext('2d');

  if (!ctx) {
    return;
  }

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
  ctx.fillStyle = '#52525c'; // TODO(ziad): text-zinc-700
  ctx.font = '10px "Jetbrains Mono", monospace';

  ctx.beginPath();
  ctx.strokeStyle = '#52525c'; // TODO(ziad): border-zinc-700
  ctx.lineWidth = 1;

  for (let tick = startTick; tick < endTick; tick += step) {
    const x = ((tick - start) / duration) * width;

    if (tick < props.viewState.minTime || tick > props.viewState.maxTime) {
      continue;
    }
    
    // Draw the tick line.
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 6);

    // Draw the tick label.
    ctx.fillText(formatTick(tick), x + 4, 4);
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