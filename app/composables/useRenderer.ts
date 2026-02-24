// This file implements the WebGL rendering logic for the trace view.
// ----
// Author: Ziad Malik
// Email: zmalik@ethz.ch
// ----


import createREGL from 'regl';

import { GridRenderer } from '@/lib/rendering/grid';
import { TraceRenderer } from '@/lib/rendering/trace';
import { ViewHelpers } from '~/lib/rendering/viewHelpers';
import type { ViewState, Stats } from '@/lib/rendering/types';

export function useRenderer(canvas: Ref<HTMLCanvasElement | null>) {
  let traceRenderer: TraceRenderer | null = null;

  const { trace } = useBackend();

  let regl: createREGL.Regl | null = null;
  let abortController: AbortController | null = null;
  let viewHelpers: ViewHelpers | null = null;

  const viewState: ViewState = reactive({
    start: 0,
    duration: 100,
    minDuration: 100,
    maxDuration: 1200,

    // Boundaries for the time range.
    minTime: 0,
    maxTime: 1000,
  })

  const stats: Stats = reactive({
    fps: 0,
    eventCount: 0,
    totalEvents: 0,
    progress: 0,
    currentLod: "",
    instancesDrawn: 0,
  })

  onUnmounted(() => {
    if (abortController) {
      abortController.abort();
    }

    if (viewHelpers) {
      if (canvas.value) {
        canvas.value.removeEventListener('wheel', viewHelpers.handleMouseWheel);
        canvas.value.removeEventListener('mousedown', viewHelpers.handleMouseDown);
      }
      window.removeEventListener('mousemove', viewHelpers.handleMouseMove);
      window.removeEventListener('mouseup', viewHelpers.handleMouseUp);
      window.removeEventListener('resize', viewHelpers.resize);
    }

    regl?.destroy();
  });

  const startStream = async () => {
    if (!regl) return;
    if (abortController) {
      abortController.abort();
    }

    abortController = new AbortController();
    const signal = abortController.signal;

    const header = await trace.getHeader();
    if (!header) return;

    const totalEntries = header.num_entries;
    stats.totalEvents = totalEntries;

    await traceRenderer?.start(stats, viewState, signal);
  }

  onMounted(async () => {
    if (!canvas.value) return;

    try {
      regl = createREGL({
        canvas: canvas.value,
        attributes: { antialias: true },
        extensions: ['angle_instanced_arrays', 'oes_texture_float']
      });

      traceRenderer = new TraceRenderer(regl, canvas.value);
      const gridRenderer = new GridRenderer(regl, canvas.value);

      let frameCount = 0;
      let lastFpsUpdate = performance.now();

      const updateFPS = () => {
        frameCount++;
        const now = performance.now();
        if (now - lastFpsUpdate >= 1000) {
          stats.fps = Math.round(frameCount * 1000 / (now - lastFpsUpdate));
          frameCount = 0;
          lastFpsUpdate = now;
        }
        return;
      }

      regl?.frame(() => {
        // I am hardcoding the tailwind bg-zinc-900 color to the background color.
        // TODO(ziad): This should be dynamic to support other color modes + themes in the future.
        const backgroundColor = [24, 24, 27, 255].map(x => x / 255) as [number, number, number, number];
        regl?.clear({ color: backgroundColor, depth: 1 });

        gridRenderer.update();

        // Skip rendering if no LOD levels are loaded
        if (traceRenderer?.lodLevels.length === 0 || traceRenderer?.lodLevels[0]!.loadedCount === 0) {
          updateFPS();
          return;
        }

        traceRenderer?.update(stats, viewState);

        updateFPS();
      });

      viewHelpers = new ViewHelpers(regl, canvas.value, viewState);

      if (canvas.value) {
        canvas.value.addEventListener('wheel', viewHelpers.handleMouseWheel, { passive: false });
        canvas.value.addEventListener('mousedown', viewHelpers.handleMouseDown);
      }
      window.addEventListener('mousemove', viewHelpers.handleMouseMove);
      window.addEventListener('mouseup', viewHelpers.handleMouseUp);
      window.addEventListener('resize', viewHelpers.resize);

      viewHelpers.resize();
      startStream();

    } catch (error) {
      console.error('Error initializing REGL:', error);
    }
  });

  return { stats, viewState }
};
