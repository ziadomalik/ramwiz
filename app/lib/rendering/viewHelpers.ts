// Mouse events, timeline helpers, etc.

import createREGL from 'regl';
import type { ViewState } from '@/lib/rendering/types';

export class ViewHelpers {
  private isDragging = false;
  private lastX = 0;

  constructor(
    private readonly regl: createREGL.Regl, 
    private readonly canvas: HTMLCanvasElement | null, 
    private readonly viewState: ViewState) 
    {}

  // Handlers for the timeline bounds.

  private clampViewStart(s: number) {
    const padding = this.viewState.duration * 0.1;
    const min = this.viewState.minTime - padding;

    // Ensure we don't clamp past the max if zoomed out far
    const max = Math.max(min, this.viewState.maxTime - this.viewState.duration + padding);
    return Math.max(min, Math.min(s, max));
  }

  // Handlers for zooming and panning.
  // Arrow functions so `this` is preserved when passed as event listener callbacks.

  handleMouseWheel = (event: WheelEvent) => {
    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const width = rect.width;

    // Calculate the time range at the mouse position.
    const timeAtMouse = this.viewState.start + (mouseX / width) * this.viewState.duration;

    // Zoom in 10% increments
    const zoomFactor = 1.1;

    if (event.deltaY > 0) {
      this.viewState.duration *= zoomFactor; // Zoom Out
    } else {
      this.viewState.duration /= zoomFactor; // Zoom In
    }

    this.viewState.duration = Math.max(this.viewState.minDuration, Math.min(this.viewState.duration, this.viewState.maxDuration));

    // Make sure that the time wherever the mouse is remains included in the view.
    const newStart = timeAtMouse - (mouseX / width) * this.viewState.duration;
    this.viewState.start = this.clampViewStart(newStart);
  };

  handleMouseDown = (e: MouseEvent) => {
    this.isDragging = true;
    this.lastX = e.clientX;
  };

  handleMouseMove = (e: MouseEvent) => {
    if (!this.isDragging || !this.canvas) return;

    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;

    const rect = this.canvas.getBoundingClientRect();
    // Fraction of screen moved * time duration = time shifted
    const dt = -(dx / rect.width) * this.viewState.duration;

    this.viewState.start = this.clampViewStart(this.viewState.start + dt);
  };

  handleMouseUp = () => {
    this.isDragging = false;
  };

  resize = () => {
    if (this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
      this.regl?.poll()
    }
  };
}
