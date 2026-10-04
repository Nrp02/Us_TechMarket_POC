// The numbers the drawing (`saturn-scene.tsx`) and the render
// (`saturn-webgl.ts`) must agree on, so the swap between them moves nothing.
// No imports: the drawing is a server component and the render is a lazy
// client chunk, and this is the only thing they share.

/** Body radius in the 1000-unit box both of them draw into. */
export const SATURN_R = 210;
/** How far the ring plane is opened toward the viewer, and the planet's roll,
    where a route does not say (each route sets its own in globals.css). */
export const SATURN_TILT_DEG = 11;
export const SATURN_ROLL_DEG = 0;
/** Toward the light: from the upper left and a little behind, so the limb
    that faces into the page is the lit one and the night side, with the
    body's shadow across the rings, falls toward the frame edge it is cropped
    by. The same upper left the panes' rims are lit from. */
export const SATURN_LIGHT: [number, number, number] = [-0.82, 0.42, -0.1];

/**
 * The ring system from the inside out: [distance from the centre in planet
 * radii, opacity, tone]. Tone 1 is the ivory of the dense B ring, 0 the
 * grey-silver of the dusty C ring and the Cassini division. Laid out after
 * the real system, coarsely enough to read at the size it is shown:
 *
 *   C ring    1.24-1.53  a haze with two brighter plateaus and the Maxwell gap
 *   B ring    1.53-1.95  three bands of rising weight, the densest outermost
 *   Cassini   1.95-2.03  nearly empty, one faint ringlet inside it
 *   A ring    2.03-2.27  mid weight, the Encke gap and the Keeler gap near
 *                        its edge
 *   F ring    2.33       one thin line, apart from the rest
 */
export const RING_STOPS: [number, number, number][] = [
  [1.235, 0, 0],
  [1.26, 0.07, 0],
  [1.33, 0.1, 0],
  [1.345, 0.17, 0.2],
  [1.37, 0.17, 0.2],
  [1.38, 0.09, 0],
  [1.44, 0.12, 0],
  [1.447, 0.03, 0],
  [1.458, 0.03, 0],
  [1.465, 0.19, 0.25],
  [1.5, 0.15, 0.2],
  [1.524, 0.24, 0.3],
  [1.53, 0.56, 0.75],
  [1.6, 0.62, 0.8],
  [1.64, 0.56, 0.75],
  [1.652, 0.8, 0.9],
  [1.73, 0.85, 0.95],
  [1.742, 0.72, 0.9],
  [1.756, 0.95, 1],
  [1.88, 0.98, 1],
  [1.9, 0.88, 1],
  [1.94, 0.93, 0.95],
  [1.948, 0.05, 0],
  [1.985, 0.04, 0],
  [1.993, 0.16, 0.1],
  [2.003, 0.05, 0],
  [2.02, 0.08, 0],
  [2.028, 0.62, 0.55],
  [2.08, 0.67, 0.6],
  [2.16, 0.6, 0.5],
  [2.208, 0.53, 0.45],
  [2.212, 0.06, 0.3],
  [2.224, 0.06, 0.3],
  [2.228, 0.5, 0.45],
  [2.256, 0.43, 0.4],
  [2.26, 0.08, 0.3],
  [2.265, 0.36, 0.4],
  [2.272, 0, 0],
  [2.316, 0, 0],
  [2.327, 0.34, 0.6],
  [2.338, 0, 0],
];

export const RING_OUTER = RING_STOPS[RING_STOPS.length - 1][0];
