// The fade between two measured shades. A change fades from the shade last
// fully shown; a second change during the fade keeps fading from it, with at
// most half the fade still to go.

export function createShadeFade<T>(fadeMs: number) {
  let from: T | null = null;
  let fadeFrom = 0;
  return {
    from: () => from,
    change(previous: T | null, now: number) {
      if (!previous) return;
      if (!from) {
        from = previous;
        fadeFrom = now;
      } else {
        fadeFrom = Math.max(fadeFrom, now - fadeMs / 2);
      }
    },
    // 0 to 1, eased; 1 when nothing is fading. The old shade is dropped once it is done.
    mix(now: number): number {
      if (!from) return 1;
      const t = Math.min(1, (now - fadeFrom) / fadeMs);
      if (t === 1) from = null;
      return t * t * (3 - 2 * t);
    },
  };
}
