// The slideshow's order: random, but stable while pictures keep arriving, so a new
// picture never makes the show jump.

export function shuffled<T>(list: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Keep the current order for pictures that are still there, drop the ones that
// went away, and add new arrivals (shuffled among themselves) at the end.
export function mergeOrder(previous: readonly string[], urls: readonly string[], rand: () => number = Math.random): string[] {
  const wanted = new Set(urls);
  const kept = previous.filter(u => wanted.has(u));
  const have = new Set(kept);
  const fresh = [...new Set(urls)].filter(u => !have.has(u));
  return [...kept, ...shuffled(fresh, rand)];
}

export function wrapIndex(index: number, length: number): number {
  return length <= 0 ? 0 : ((index % length) + length) % length;
}
