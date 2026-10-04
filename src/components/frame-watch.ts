// Judges whether a device holds the planet's frame rate: the mean gap between
// frames over a window of samples. One slow window shrinks the buffer; a
// second one gives up.

export type FrameVerdict = "ok" | "shrink" | "giveUp";

export function createFrameWatch({ window = 90, slowMs = 40 } = {}) {
  let samples = 0;
  let sum = 0;
  let strikes = 0;
  return {
    sample(gap: number): FrameVerdict {
      sum += gap;
      if (++samples < window) return "ok";
      const slow = sum / samples > slowMs;
      samples = 0;
      sum = 0;
      if (!slow) return "ok";
      return ++strikes === 2 ? "giveUp" : "shrink";
    },
  };
}
