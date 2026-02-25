export interface ViewState {
  start: number;
  duration: number;
  minDuration: number;
  maxDuration: number;
  minTime: number;
  maxTime: number;
}

export interface Stats {
  fps: number;
  eventCount: number;
  totalEvents: number;
  progress: number;
  currentLod: string;
  instancesDrawn: number;
  violationCount: number;
}