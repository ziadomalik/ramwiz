/// Constraint violation detection for trace events.
/// ----
/// Author: Ziad Malik
/// Email: zmalik@ethz.ch
/// ----

import type { ConstraintRule, ConstraintScope } from '@/composables/useBackend';

export interface EventData {
  starts: Float32Array;
  cmds: Uint8Array;
  channels: Uint8Array;
  bankgroups: Uint8Array;
  banks: Uint8Array;
  ranks: Uint8Array;
  count: number;
}

// Compute a scope key for an event
// The key encodes which "group" the event belongs to for a given scope level.
//   - channel:   group by channel
//   - rank:      group by (channel, rank)
//   - bankgroup: group by (channel, bankgroup)
//   - bank:      group by (channel, bankgroup, bank)
// Keys are packed into a single integer (works for up to 256 of each dimension).
function getScopeKey(data: EventData, idx: number, scope: ConstraintScope): number {
  const ch = data.channels[idx]!;
  switch (scope) {
    case 'channel':
      return ch;
    case 'rank':
      return (ch << 8) | data.ranks[idx]!;
    case 'bankgroup':
      return (ch << 8) | data.bankgroups[idx]!;
    case 'bank':
      return (ch << 16) | (data.bankgroups[idx]! << 8) | data.banks[idx]!;
  }
}

// For sibling-rank constraints, the grouping scope changes:
// events are grouped by channel (so different ranks in the same channel appear together)
// and the violation only fires when the two events are on *different* ranks.
function getEffectiveScope(rule: ConstraintRule): ConstraintScope {
  if (rule.scope === 'rank' && rule.siblingRank) return 'channel';
  return rule.scope;
}

export function computeViolations(
  data: EventData,
  rules: ConstraintRule[],
): { violations: Uint8Array; count: number } {
  const violations = new Uint8Array(data.count);

  for (const rule of rules) {
    if (rule.enabled === false) continue;

    const precedingSet = new Set(rule.preceding);
    const followingSet = new Set(rule.following);

    if (precedingSet.size === 0 || followingSet.size === 0) continue;

    const effectiveScope = getEffectiveScope(rule);

    // Group relevant event indices by scope key
    const groups = new Map<number, number[]>();

    for (let i = 0; i < data.count; i++) {
      const cmd = data.cmds[i]!;
      if (!precedingSet.has(cmd) && !followingSet.has(cmd)) continue;

      const key = getScopeKey(data, i, effectiveScope);
      let group = groups.get(key);
      if (!group) {
        group = [];
        groups.set(key, group);
      }
      group.push(i);
    }

    // Check violations within each group
    for (const indices of groups.values()) {
      if (rule.window) {
        checkWindowViolation(data, indices, rule, precedingSet, violations);
      } else {
        checkPairwiseViolation(data, indices, rule, precedingSet, followingSet, violations);
      }
    }
  }

  let count = 0;
  for (let i = 0; i < data.count; i++) {
    if (violations[i]) count++;
  }

  return { violations, count };
}

// Determine which constraint rules a specific event violates
// Called on-demand when the user hovers a flagged event
export function getViolationReasons(
  data: EventData,
  eventIndex: number,
  rules: ConstraintRule[],
): string[] {
  const reasons: string[] = [];
  const myCmd = data.cmds[eventIndex]!;
  const myStart = data.starts[eventIndex]!;

  for (const rule of rules) {
    if (rule.enabled === false) continue;

    const precedingSet = new Set(rule.preceding);
    const followingSet = new Set(rule.following);
    if (precedingSet.size === 0 || followingSet.size === 0) continue;

    // This event must be relevant to the rule
    if (!precedingSet.has(myCmd) && !followingSet.has(myCmd)) continue;

    const effectiveScope = getEffectiveScope(rule);
    const myKey = getScopeKey(data, eventIndex, effectiveScope);
    let found = false;

    if (rule.window) {
      // Window constraint: count preceding commands in scope within the time window
      if (precedingSet.has(myCmd)) {
        let windowCount = 0;
        for (let i = eventIndex; i >= 0; i--) {
          const diff = myStart - data.starts[i]!;
          if (diff >= rule.latencyCycles) break;
          if (getScopeKey(data, i, effectiveScope) !== myKey) continue;
          if (precedingSet.has(data.cmds[i]!)) windowCount++;
        }
        if (windowCount > rule.window!) found = true;
      }
    } else {
      // Pairwise constraint: this event is the "following" — scan backwards for "preceding"
      if (followingSet.has(myCmd)) {
        for (let i = eventIndex - 1; i >= 0; i--) {
          const diff = myStart - data.starts[i]!;
          if (diff >= rule.latencyCycles) break;
          if (getScopeKey(data, i, effectiveScope) !== myKey) continue;
          if (!precedingSet.has(data.cmds[i]!)) continue;
          if (rule.siblingRank && data.ranks[i] === data.ranks[eventIndex]) continue;
          found = true;
          break;
        }
      }

      // Pairwise: this event is the "preceding" — scan forwards for "following"
      if (!found && precedingSet.has(myCmd)) {
        for (let i = eventIndex + 1; i < data.count; i++) {
          const diff = data.starts[i]! - myStart;
          if (diff >= rule.latencyCycles) break;
          if (getScopeKey(data, i, effectiveScope) !== myKey) continue;
          if (!followingSet.has(data.cmds[i]!)) continue;
          if (rule.siblingRank && data.ranks[i] === data.ranks[eventIndex]) continue;
          found = true;
          break;
        }
      }
    }

    if (found) {
      reasons.push(rule.description || rule.id);
    }
  }

  return reasons;
}

// Standard pairwise constraint check
// For each "following" event B, scan backwards for "preceding" events A.
// If `B.start - A.start < rule.latencyCycles` → both A and B are marked as violations.
// When `siblingRank` is true, only flag when A and B are on different ranks.
function checkPairwiseViolation(
  data: EventData,
  indices: number[],
  rule: ConstraintRule,
  precedingSet: Set<number>,
  followingSet: Set<number>,
  violations: Uint8Array,
): void {
  for (let j = 0; j < indices.length; j++) {
    const idxB = indices[j]!;
    const cmdB = data.cmds[idxB]!;
    if (!followingSet.has(cmdB)) continue;

    const startB = data.starts[idxB]!;

    for (let i = j - 1; i >= 0; i--) {
      const idxA = indices[i]!;
      const startA = data.starts[idxA]!;
      const diff = startB - startA;

      // Events are time-sorted: once we exceed the latency window we can stop.
      if (diff >= rule.latencyCycles) break;

      const cmdA = data.cmds[idxA]!;
      if (!precedingSet.has(cmdA)) continue;

      // Sibling-rank: violation only when the two events are on different ranks
      if (rule.siblingRank) {
        if (data.ranks[idxA] === data.ranks[idxB]) continue;
      }

      violations[idxA] = 1;
      violations[idxB] = 1;
    }
  }
}

// Sliding-window constraint check (e.g. nFAW: no more than `window` ACTs in `latencyCycles`)
// Maintains a deque of recent preceding events. If the deque size exceeds `rule.window`, all events in the window are flagged.
function checkWindowViolation(
  data: EventData,
  indices: number[],
  rule: ConstraintRule,
  precedingSet: Set<number>,
  violations: Uint8Array,
): void {
  const windowSize = rule.window!;
  const recentPreceding: number[] = [];

  for (let j = 0; j < indices.length; j++) {
    const idx = indices[j]!;
    const cmd = data.cmds[idx]!;
    const start = data.starts[idx]!;

    if (!precedingSet.has(cmd)) continue;

    // Evict events that have fallen outside the latency window
    while (recentPreceding.length > 0) {
      const oldIdx = recentPreceding[0]!;
      if (start - data.starts[oldIdx]! >= rule.latencyCycles) {
        recentPreceding.shift();
      } else {
        break;
      }
    }

    recentPreceding.push(idx);

    // More than `windowSize` preceding events within the latency window → violation
    if (recentPreceding.length > windowSize) {
      for (const violIdx of recentPreceding) {
        violations[violIdx] = 1;
      }
    }
  }
}
