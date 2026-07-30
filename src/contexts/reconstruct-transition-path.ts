import type { ContextTransition } from "./types.js";

export function reconstructTransitionPath(
  transitions: readonly ContextTransition[],
  fromContextId: string,
  toContextId: string,
): ContextTransition[] {
  if (fromContextId === toContextId) {
    return [];
  }

  const outgoing = new Map<string, ContextTransition[]>();
  for (const transition of transitions) {
    const list = outgoing.get(transition.fromContextId) ?? [];
    list.push(transition);
    outgoing.set(transition.fromContextId, list);
  }

  const queue: Array<{ contextId: string; path: ContextTransition[] }> = [
    { contextId: fromContextId, path: [] },
  ];
  const visited = new Set<string>([fromContextId]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }

    for (const transition of outgoing.get(current.contextId) ?? []) {
      const nextPath = [...current.path, transition];
      if (transition.toContextId === toContextId) {
        return nextPath;
      }
      if (!visited.has(transition.toContextId)) {
        visited.add(transition.toContextId);
        queue.push({ contextId: transition.toContextId, path: nextPath });
      }
    }
  }

  return [];
}
