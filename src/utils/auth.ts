export function mergeScopePolicies(
  policyA: string[][],
  policyB: string[][],
): string[][] {
  if (policyA.length === 0 || policyB.length === 0) {
    return policyA.length
      ? policyA.map((group) => [...group])
      : policyB.map((group) => [...group]);
  }

  const groupMap = new Map<string, string[]>();

  for (const groupA of policyA) {
    for (const groupB of policyB) {
      // Merge by taking union of both groups
      const merged = Array.from(new Set([...groupA, ...groupB])).sort();
      const key = merged.join(",");
      groupMap.set(key, merged);
    }
  }

  // Prune redundant groups, keep only minimal groups (subsets eliminate their supersets)
  const candidates = Array.from(groupMap.values()).sort(
    (a, b) => a.length - b.length,
  );

  const finalGroups: string[][] = [];
  for (const candidate of candidates) {
    if (!finalGroups.some((existing) => isSubset(existing, candidate))) {
      finalGroups.push(candidate);
    }
  }

  // Final sort by length, then lexicographically
  finalGroups.sort(
    (a, b) => a.length - b.length || a.join(",").localeCompare(b.join(",")),
  );

  return finalGroups;
}

function isSubset(subset: string[], superset: string[]): boolean {
  if (subset.length > superset.length) {
    return false;
  }

  const supersetSet = new Set(superset);
  return subset.every((item) => supersetSet.has(item));
}
