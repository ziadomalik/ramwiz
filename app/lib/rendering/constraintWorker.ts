/// Web Worker for off-thread constraint violation computation.
/// ----
/// Author: Ziad Malik
/// Email: zmalik@ethz.ch
/// ----

import { computeViolations, type EventData } from './constraints';
import type { ConstraintRule } from '@/composables/useBackend';

export interface WorkerInput {
  data: EventData;
  rules: ConstraintRule[];
}

export interface WorkerOutput {
  violations: Uint8Array;
  count: number;
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { data, rules } = e.data;
  const { violations, count } = computeViolations(data, rules);

  (self as unknown as Worker).postMessage(
    { violations, count } satisfies WorkerOutput,
    [violations.buffer] as any,
  );
};

