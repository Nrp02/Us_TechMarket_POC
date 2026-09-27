import type { CSSProperties } from "react";

// The page's own atmosphere: one fixed layer behind everything, holding the
// clouds that carry every trace of blue in the product, and the silver
// starfield in front of them.
//
// Server-rendered inline SVG, and deliberately not a client component. The
// product's rule is that nothing renders on the client for a purely visual
// gain, and a night sky is the purest possible case of that. No canvas, no
// image request, no runtime randomness — the star coordinates below are
// literals and the clouds are seeded fractals, so the sky is byte-identical on
// every render and can be hand-tuned.
//
// The bright stars scintillate, and nothing else in the product moves. The rule
// used to be that the stars must not twinkle either; it has been sharpened
// rather than dropped, and the sharper version is the one worth keeping:
// **nothing that carries information may move, and the room may.**
//
// A price, a change, a badge, a rank and a sparkline are the session, and the
// session is over — animating any of them would claim something is still
// happening. A star carries nothing at all. See `star-breathe` in globals.css
// for the two constraints that keep it honest: it only ever dims below each
// star's own measured base, and it is confined to this tier.
//
// --- Two materials, and the ratio between them ----------------------------
//
// Read the colour strategy at the top of `globals.css` first; this file is
// where two of its five roles are actually painted, and both are about
// PROPORTION rather than hue.
//
// THE WEATHER is the only large area of colour in the product, and it is now
// THREE masses rather than four, arranged as a system rather than a spread:
//
//   DOMINANT   the subject, entering from the right edge at mid-height.
//   COMPANION  smaller, overlapping the dominant at 0.57 of their combined
//              radii, so the two read as one weather system. Nearer than about
//              0.55 and they merge into a single shape; past 0.85 and they
//              become two unrelated blobs.
//   DISTANT    the faintest, in the opposite corner at 0.85 of the frame
//              diagonal — the minimum separation at which two clouds stop
//              looking related. Its job is depth, not mass.
//
// The previous arrangement was four masses, one per cell of a 3x2 grid. That
// rule was invented to fix clustering and it did, by forbidding the one thing
// that makes weather read as weather: masses that belong to each other. Four
// evenly-spaced clouds are a distribution, not a composition, and the sky read
// as four blobs someone had placed.
//
// The system sits right of frame on purpose. The sky is not composed alone —
// it is composed underneath the interface, and the navigation rail is a heavy
// object permanently parked on the left. Weighting the weather right balances
// the image a visitor actually sees.
//
// How this was arrived at is worth stating, because five rounds of scoring
// functions produced arrangements that all read as odd: **the director fixes
// the composition, the script checks the constraints.** A weighted sum has no
// taste, and every attempt to give it some ended with two terms pulling
// against each other. What the script is good at is answering "does this
// overlap text, is enough of it visible, is the overlap inside the range" —
// and it rejected two hand-placed companions before this one passed.
//
// THE SILVER is the counterweight, and it is why the blue reads as blue. It
// runs at three tiers and 313 points, against 76 two passes ago: dust that is
// barely there, stars, and eighteen bright ones with haloes. Silver kept
// reading as the scarcer of the two materials, so it has been raised twice —
// in count, in radius and in opacity at every tier. The dust tier needed the
// radius most: below about 0.8 units it lands under a pixel once the viewBox
// is scaled down, and an antialiased sub-pixel dot is a rumour rather than a
// star.
//
// The two materials are also balanced from the other side. Cloud opacities
// came down by about a sixth in the same pass, which lowers the blue without
// touching the silver — and the harness caught that it had to: the spread-out
// composition raised the field's brightest pixel past the value every contrast
// pair in the product is measured against.
//
// --- Why the clouds are displaced rather than thresholded -----------------
//
// The first version alpha-thresholded a noise field and blurred it, which
// produces vapour but never a cloud: the silhouette is statistical, so every
// edge is equally soft everywhere and the eye reads it as fog on the lens. A
// real cloud is a BODY — lobes with a defined top and a shadowed underside.
//
// So each mass here is drawn as a cluster of soft radial lobes, and the noise
// is applied to that cluster through `feDisplacementMap`: the silhouette is
// authored, and the fractal only pushes it around. That is what produces a
// billowed edge that bulges and pinches instead of dissolving evenly. The
// cluster then fills a gradient that runs lit at the top to shadowed at the
// base, so each mass has a light direction — the same upper-left the panel
// rims are lit from.
//
// The cost is four filtered masks whose regions are each a cloud's bounding
// box, on a layer that never re-renders — cheaper than the two full-viewport
// turbulence passes it replaces, which is why the octave count could go up.

// [x, y, radius, opacity] in the 1600x1000 viewBox.
//
// Three tiers, generated once from a seeded placement with a minimum spacing
// per tier and a density that falls off toward the bottom of the sky. A clump
// reads as a galaxy, which is the one thing this sky must not look like.
//
// DUST is the tier that does the work the old sky was missing: 120 points too
// faint to read individually, whose only job is to make the field feel
// occupied rather than empty between the stars that do read.
const DUST: [number, number, number, number][] = [
  [1008, 722.4, 1.44, 0.21],
  [258.3, 452.9, 1.41, 0.22],
  [82.7, 586.4, 1.51, 0.29],
  [734.6, 323, 1.76, 0.28],
  [1191.2, 983.8, 1.47, 0.2],
  [942.9, 545.3, 1.26, 0.32],
  [637.4, 97, 1.71, 0.25],
  [303.7, 189.1, 1.57, 0.24],
  [1417.5, 210.9, 1.62, 0.27],
  [328.7, 884.5, 1.59, 0.26],
  [913.5, 709.8, 1.46, 0.25],
  [413.1, 133, 1.5, 0.28],
  [595.6, 686, 1.33, 0.19],
  [347.6, 785.3, 1.25, 0.18],
  [46.8, 607, 1.46, 0.2],
  [1185.5, 438.2, 1.37, 0.18],
  [1593.6, 451.3, 1.3, 0.21],
  [74.5, 491.6, 1.77, 0.17],
  [448.6, 389.9, 1.29, 0.26],
  [817.9, 520.4, 1.52, 0.28],
  [1290.9, 649.8, 1.21, 0.29],
  [1107.7, 71.2, 1.47, 0.18],
  [1058.3, 92, 1.24, 0.24],
  [901.3, 211.5, 1.45, 0.31],
  [1127.1, 187.8, 1.4, 0.25],
  [211.9, 250, 1.52, 0.23],
  [599.1, 349.8, 1.41, 0.27],
  [1547.8, 642.7, 1.7, 0.28],
  [1052.9, 28.9, 1.45, 0.19],
  [692.5, 871.5, 1.47, 0.32],
  [1034, 116.4, 1.61, 0.31],
  [921.7, 652.4, 1.62, 0.16],
  [1462, 340.7, 1.5, 0.21],
  [1509.2, 652.5, 1.33, 0.22],
  [592.9, 55.7, 1.62, 0.31],
  [1366.4, 578.9, 1.69, 0.26],
  [1524.5, 520.7, 1.72, 0.19],
  [716.5, 374.2, 1.27, 0.21],
  [1166.6, 27.1, 1.57, 0.22],
  [174.9, 46.7, 1.32, 0.18],
  [136.2, 984.3, 1.36, 0.32],
  [1193.3, 700.6, 1.38, 0.31],
  [190.4, 543.3, 1.48, 0.23],
  [466.1, 669.2, 1.62, 0.21],
  [946.6, 415, 1.58, 0.22],
  [921.9, 394, 1.45, 0.21],
  [1000.9, 961.5, 1.29, 0.27],
  [772.3, 989, 1.27, 0.29],
  [1172.5, 60.6, 1.24, 0.18],
  [981.5, 694.6, 1.46, 0.19],
  [1598.8, 167.9, 1.61, 0.3],
  [584.6, 485.8, 1.64, 0.2],
  [1252.5, 37.7, 1.6, 0.3],
  [636.4, 481.9, 1.7, 0.3],
  [1137.3, 747.7, 1.49, 0.27],
  [27.3, 133.3, 1.66, 0.26],
  [1082.8, 666.6, 1.48, 0.21],
  [1242.7, 299.8, 1.65, 0.29],
  [696.5, 242.3, 1.74, 0.19],
  [590.8, 862.7, 1.38, 0.31],
  [1167.7, 358.3, 1.49, 0.2],
  [26.7, 313.5, 1.47, 0.2],
  [1300.1, 777.2, 1.51, 0.32],
  [524.9, 460.2, 1.61, 0.26],
  [1121.3, 710.4, 1.45, 0.25],
  [715.1, 624.9, 1.53, 0.27],
  [542.4, 4.4, 1.31, 0.21],
  [755.1, 248.9, 1.75, 0.2],
  [988, 535.1, 1.68, 0.22],
  [1575.3, 6.2, 1.41, 0.26],
  [123.1, 631, 1.36, 0.2],
  [277.3, 763.1, 1.54, 0.31],
  [542.9, 951.9, 1.43, 0.27],
  [359, 817.9, 1.27, 0.19],
  [517.5, 108.2, 1.75, 0.21],
  [1568.8, 871.1, 1.68, 0.19],
  [509.4, 750, 1.26, 0.2],
  [93, 138.6, 1.65, 0.23],
  [586.3, 121.5, 1.43, 0.18],
  [500.2, 245, 1.42, 0.17],
  [1198.4, 894.3, 1.55, 0.2],
  [738.5, 588.9, 1.47, 0.3],
  [1510.7, 75.5, 1.29, 0.18],
  [1114.1, 39.4, 1.62, 0.26],
  [1429.2, 766.6, 1.69, 0.32],
  [1007.6, 465.5, 1.48, 0.29],
  [1190, 953, 1.47, 0.21],
  [104.3, 697.1, 1.56, 0.31],
  [1480.7, 484.6, 1.47, 0.2],
  [97.5, 753, 1.34, 0.18],
  [1260, 822, 1.59, 0.17],
  [1381.6, 361.7, 1.78, 0.29],
  [223.3, 720.7, 1.49, 0.29],
  [297.9, 109.9, 1.77, 0.21],
  [843.7, 4.4, 1.41, 0.17],
  [1397.2, 30, 1.44, 0.22],
  [247.6, 392.3, 1.7, 0.26],
  [1490.1, 197.4, 1.64, 0.25],
  [1538.2, 100.5, 1.5, 0.22],
  [608, 502.4, 1.37, 0.18],
  [987, 150.3, 1.62, 0.2],
  [1502.4, 539.7, 1.77, 0.22],
  [902.7, 142.8, 1.38, 0.28],
  [1082.8, 551.5, 1.73, 0.3],
  [42.1, 367.2, 1.49, 0.27],
  [551.4, 73.2, 1.49, 0.3],
  [381.6, 641.1, 1.64, 0.29],
  [739, 555, 1.39, 0.19],
  [134.5, 512.9, 1.41, 0.17],
  [787.1, 11.7, 1.55, 0.23],
  [472.7, 302.9, 1.76, 0.31],
  [314.8, 301.6, 1.32, 0.22],
  [28.4, 88.8, 1.71, 0.25],
  [725.7, 526.5, 1.54, 0.31],
  [1461.8, 817.9, 1.6, 0.27],
  [1366.7, 273.6, 1.52, 0.25],
  [1284.2, 539.9, 1.54, 0.19],
  [381, 142.8, 1.7, 0.27],
  [757.1, 455.5, 1.34, 0.24],
  [1444.5, 793.8, 1.26, 0.2],
  [1302.8, 17.2, 1.4, 0.3],
  [129.4, 780.7, 1.5, 0.32],
  [823.1, 41.4, 1.72, 0.21],
  [364.6, 691.2, 1.43, 0.24],
  [163.9, 121.6, 1.49, 0.24],
  [660.4, 501.8, 1.71, 0.28],
  [388.8, 107.2, 1.29, 0.29],
  [358.3, 587.4, 1.47, 0.32],
  [1419.1, 645.6, 1.36, 0.19],
  [1000.5, 42.3, 1.24, 0.23],
  [1354.9, 691.6, 1.66, 0.21],
  [149.1, 80.9, 1.3, 0.2],
  [1535.2, 1.8, 1.46, 0.27],
  [1058.3, 416.4, 1.52, 0.24],
  [1256.6, 355.8, 1.55, 0.27],
  [302.5, 548.7, 1.58, 0.22],
  [651.5, 755, 1.38, 0.17],
  [871, 180.1, 1.34, 0.2],
  [145.4, 901.9, 1.31, 0.18],
  [403.6, 602.1, 1.52, 0.29],
  [816.8, 110.3, 1.35, 0.2],
  [1399.5, 88, 1.48, 0.28],
  [57.2, 153.4, 1.44, 0.23],
  [1335.2, 477.3, 1.64, 0.17],
  [183.2, 870.8, 1.7, 0.17],
  [941.8, 795.7, 1.79, 0.28],
  [1222.7, 842.5, 1.63, 0.28],
  [905.2, 280.3, 1.27, 0.27],
  [631.9, 784.6, 1.25, 0.22],
  [1211.9, 53.1, 1.36, 0.22],
  [22.4, 47.5, 1.56, 0.19],
  [413.5, 936.6, 1.61, 0.16],
  [740.1, 412.5, 1.68, 0.31],
  [923.1, 619.8, 1.58, 0.22],
  [1374.5, 159.5, 1.66, 0.32],
  [1202.4, 319.7, 1.23, 0.25],
  [356.8, 539, 1.79, 0.26],
  [1028.8, 144.7, 1.33, 0.21],
  [720.2, 952.7, 1.42, 0.17],
  [1535.9, 863, 1.69, 0.19],
  [1574.3, 79, 1.54, 0.19],
  [119.7, 205.3, 1.77, 0.31],
  [487.5, 619.7, 1.62, 0.31],
  [1319.4, 547.4, 1.25, 0.3],
  [1044, 55.8, 1.41, 0.3],
  [242.7, 32.4, 1.68, 0.31],
  [858.8, 889.1, 1.77, 0.21],
  [327.5, 961.1, 1.59, 0.2],
  [862.6, 439.8, 1.59, 0.28],
  [449.7, 514.7, 1.22, 0.22],
  [74.2, 897.4, 1.47, 0.29],
  [121.3, 472.3, 1.44, 0.28],
  [174.6, 158.8, 1.24, 0.16],
  [1132.5, 158.9, 1.25, 0.2],
  [1074.1, 780.4, 1.56, 0.19],
  [1077.3, 637.2, 1.43, 0.19],
  [1223.4, 124.7, 1.41, 0.3],
  [1109.9, 678.8, 1.77, 0.28],
  [1379.5, 520.4, 1.35, 0.22],
  [1268.4, 270.5, 1.78, 0.25],
  [218.7, 117.9, 1.25, 0.18],
  [1546.5, 989.5, 1.64, 0.29],
  [526.7, 264.8, 1.34, 0.31],
  [1128.5, 326.8, 1.27, 0.23],
  [1166.3, 161.6, 1.78, 0.24],
  [138.8, 554.5, 1.35, 0.29],
  [1450.7, 220.5, 1.43, 0.31],
  [316, 854.3, 1.37, 0.19],
  [1574.1, 495.1, 1.28, 0.22],
  [826.3, 995.8, 1.5, 0.26],
];

export const DIM: [number, number, number, number][] = [
  [1103.7, 70.6, 2.76, 0.53],
  [1316.6, 446.8, 2.45, 0.37],
  [1556.1, 470.2, 2.73, 0.52],
  [1461.5, 336.8, 2.7, 0.43],
  [1550.9, 257.5, 2.27, 0.4],
  [939.8, 800.8, 3.15, 0.55],
  [797.5, 982, 3.16, 0.36],
  [972.5, 2.9, 2.45, 0.37],
  [351.9, 653.3, 3.2, 0.39],
  [1373.1, 338.5, 2.67, 0.31],
  [1378.1, 880.7, 2.78, 0.48],
  [626.3, 806.9, 2.29, 0.49],
  [1219.3, 113.4, 2.8, 0.42],
  [212.8, 906, 3.1, 0.35],
  [90.2, 326.9, 2.33, 0.32],
  [1030.9, 250.8, 2.42, 0.38],
  [422.2, 89.6, 3.14, 0.35],
  [1005.7, 92.5, 2.83, 0.53],
  [1431, 100.9, 3.01, 0.54],
  [1027.4, 435.9, 2.76, 0.42],
  [49.6, 811, 2.57, 0.43],
  [590.8, 838.4, 2.87, 0.32],
  [996.1, 506.9, 3.09, 0.53],
  [99.9, 379.3, 2.56, 0.33],
  [987.8, 386.2, 3.01, 0.47],
  [440.7, 360, 3.16, 0.44],
  [405.5, 426.7, 2.97, 0.55],
  [1204.6, 37.6, 3.02, 0.43],
  [599.1, 187.8, 2.98, 0.52],
  [1490.4, 857.1, 2.28, 0.48],
  [227.6, 580.8, 2.69, 0.39],
  [947.6, 887.6, 2.93, 0.55],
  [1467.8, 127.5, 2.44, 0.44],
  [117.5, 128.4, 2.89, 0.4],
  [751.8, 669.1, 2.48, 0.53],
  [1538.1, 671.2, 2.6, 0.39],
  [1021.9, 16.2, 3.11, 0.39],
  [658.7, 524.5, 3.07, 0.35],
  [1339.1, 32.4, 3.15, 0.47],
  [143.8, 451.5, 3.02, 0.38],
  [552.1, 932, 2.98, 0.51],
  [1588, 55, 3.16, 0.49],
  [82.3, 670.2, 2.56, 0.49],
  [919.7, 181.4, 2.55, 0.4],
  [508.8, 368.3, 2.9, 0.42],
  [770.5, 185.4, 2.22, 0.37],
  [301.7, 966, 3.12, 0.39],
  [439.7, 141.1, 3.04, 0.37],
  [1453.4, 971.8, 2.43, 0.47],
  [410.3, 536.3, 2.87, 0.33],
  [838.6, 530.2, 2.21, 0.41],
  [1557, 16.9, 3.06, 0.47],
  [1266.8, 969.4, 3.16, 0.33],
  [887.2, 896.4, 2.4, 0.43],
  [858.4, 586.5, 3.17, 0.45],
  [1093.1, 519.3, 2.65, 0.44],
  [1599.6, 149.1, 3.03, 0.39],
  [1300.1, 501.1, 2.25, 0.5],
  [208.6, 435.1, 2.87, 0.55],
  [891.1, 640.8, 2.83, 0.46],
  [947.8, 488.6, 2.88, 0.45],
  [641.2, 896.5, 2.74, 0.46],
  [319.1, 445.7, 2.78, 0.51],
  [1256.9, 597.9, 2.21, 0.33],
  [784.9, 279.6, 2.22, 0.41],
  [8.6, 585.7, 3.14, 0.38],
  [1477.6, 6.4, 2.45, 0.41],
  [1174.6, 3.8, 2.91, 0.4],
  [523.3, 472.3, 2.95, 0.32],
  [1158.7, 266.6, 2.79, 0.3],
  [1385.2, 30.9, 2.58, 0.33],
  [1309.7, 95.9, 3.01, 0.53],
  [801.5, 472.3, 3.06, 0.4],
  [829.7, 686.9, 2.96, 0.32],
  [1086.4, 180.6, 2.88, 0.43],
  [926.6, 75.8, 3.09, 0.52],
  [558.8, 159.9, 2.72, 0.31],
  [340.3, 155.7, 2.26, 0.55],
  [740.1, 927.1, 2.39, 0.33],
  [1094.4, 271, 2.99, 0.44],
  [840.5, 301.7, 2.54, 0.5],
  [144.1, 273.1, 2.72, 0.54],
  [28.2, 484.8, 2.84, 0.4],
  [729.4, 730.8, 3.17, 0.49],
  [643, 979.1, 3.01, 0.44],
  [1213.3, 944.3, 3, 0.38],
  [467.5, 207.3, 2.39, 0.42],
  [418.2, 296.9, 3.13, 0.54],
  [998.6, 581.1, 2.29, 0.33],
  [184.7, 25.1, 3.06, 0.5],
  [1357.2, 648.6, 2.45, 0.5],
  [1476.6, 221.6, 2.96, 0.31],
  [80.9, 774, 3.14, 0.3],
  [476.1, 912, 2.48, 0.35],
  [98.8, 902.3, 3.06, 0.39],
  [95.3, 16.6, 2.36, 0.33],
  [319.7, 235.2, 2.48, 0.41],
  [355.9, 265.5, 3, 0.4],
  [264.4, 155.7, 3.19, 0.45],
  [275, 679.7, 3.18, 0.35],
  [553.2, 90, 2.77, 0.33],
  [473.9, 318.5, 3.01, 0.54],
  [1447.9, 741.4, 2.92, 0.48],
  [55.5, 165.4, 2.78, 0.52],
  [1550.6, 325.7, 3.08, 0.35],
];

// The bright ones, each with a soft halo.
//
// Excluded from the PANEL RECTANGLES themselves, not from a column of the
// frame. The rule used to be "x < 260 or x > 1340", justified as keeping a
// bright star outside the 1200px content column — but that column runs from
// 314 to 1575 in these coordinates, so the whole 1340-1575 band it permitted
// is inside it. Measured on the built page, the brightest pixel in the entire
// sky was a bright star sitting behind the session digest panel. The rule was
// wrong from the day it was written and only started mattering when the stars
// grew large enough to survive the blur.
//
// Now checked against the union of every panel on all three routes, with 24
// units of margin. A dim star bleeding through glass is what the material is
// for; a crisp bright one under text is a hot spot, and the Worst-Case
// Composite Rule does not model point sources.
export const BRIGHT: [number, number, number, number][] = [
  [843.5, 186.7, 3.19, 0.79],
  [506.4, 144, 3.41, 0.57],
  [412.3, 271.7, 4.02, 0.63],
  [209.1, 594.3, 4.13, 0.67],
  [673.7, 263.9, 3.48, 0.68],
  [1053, 265.1, 3.53, 0.66],
  [400.6, 34.6, 3.39, 0.61],
  [324.9, 74.2, 4.2, 0.6],
  [1141.4, 82.9, 3.03, 0.71],
  [68.6, 426, 3.08, 0.7],
  [1383.3, 53.6, 3.63, 0.72],
  [129.4, 520.2, 3.1, 0.76],
  [976.3, 960.9, 4.12, 0.77],
  [417.1, 144.3, 3.28, 0.59],
  [906.4, 31, 3.84, 0.62],
  [72.3, 86.4, 4.09, 0.79],
  [148.2, 437.6, 3.15, 0.67],
  [989.4, 154.7, 3.39, 0.74],
];

// Each mass is a cluster of lobes: [cx, cy, rx, ry, fillOpacity].
//
// --- How these four positions were chosen ---------------------------------
//
// By solving for them, not by eye. `scripts` is not the place for a one-off,
// so the search lived in a scratch script, but the objective is worth writing
// down because the first two runs of it were wrong in instructive ways.
//
// The search grids candidate centroids over the viewBox and scores each by:
// how much of the mass falls on sky a visitor can actually see (page geometry
// unioned across all three routes), how much falls behind glass (worth less,
// but not nothing — that is what lights a panel), proximity to a rule-of-
// thirds intersection, separation from masses already placed, and a penalty
// for corners. Masses are placed largest-first, in a 1 : 0.77 : 0.6 : 0.47
// size ratio, and any candidate overlapping text that sits DIRECTLY on the sky
// is rejected outright — the page headings, the section rules and the ticker
// header are the only copy in the product with no glass under it.
//
// Run one put the dominant mass at 0% visible sky: entirely behind panels,
// where it would light the glass beautifully and never once read as weather.
// Run two put it in the bottom-left corner, because the sampler was counting
// points outside the canvas as "sky with no panel on it" — free score for area
// that is never rendered. Both were the objective being wrong rather than the
// answer being surprising, and both are now constraints: a minimum visible
// fraction, an off-canvas cap, and a real corner penalty.
//
// What came out balances without symmetry. The mass-weighted centroid sits at
// x 792 of 1600 and y 549 of 1000 — near the middle of the frame, while no
// single mass is anywhere near the middle. The upper left, where the page's
// own heading sits and where there was far too much blue, is now empty sky.
//
// Each mass is a CORE of rounded lobes with a flatter SKIRT under it at half
// fill. That is the shape of real cloud — piled and rounded on top where the
// light hits, flat underneath where it does not — and it is what a single ring
// of ellipses could never produce however much it was displaced.
const CLOUDS: {
  id: string;
  filter: string;
  opacity: number;
  box: [number, number, number, number];
  lobes: [number, number, number, number, number][];
}[] = [
  {
    // HAZE. The layer that makes this read as a sky rather than as a cloud.
    //
    // Everything else here is a mass with a silhouette; this is atmosphere —
    // very large, very faint, and centred on the middle of the frame, which
    // until now held no weather at all. Two things made that a problem. On a
    // wide screen the eye found one bright system at the right edge and empty
    // black everywhere else, so the field read as "a cloud" rather than as air.
    // And `xMidYMid slice` crops to the CENTRE of the viewBox: at 390px only x
    // 569-1031 is on screen, which is precisely the band that was empty, so a
    // phone got a starfield with no weather in it whatsoever.
    //
    // 0.07 rather than the 0.17-0.28 the masses run at. It is meant to be felt
    // and not seen — at a readable opacity a mass this size would flood the
    // panels and take the field's brightest pixel with it.
    id: "cloud-haze",
    filter: "billow-a",
    opacity: 0.07,
    box: [80, 170, 1310, 600],
    lobes: [
      [725, 430, 330, 200, 1],
      [945, 470, 275, 168, 1],
      [515, 468, 258, 158, 1],
      [755, 566, 420, 120, 0.5],
    ],
  },
  {
    // DRIFT. A third scale, upper middle-left.
    //
    // The composition had two sizes — a dominant system and one faint distant
    // mass — which reads as near and far with nothing between them. This sits
    // at about half the dominant's radius and a little over twice the distant's
    // opacity, so the frame carries three depths rather than two. It is also
    // inside the phone's visible band, which the other masses are not.
    // Raised from 0.12 and a quarter larger. At 5% of the field's weight it was
    // a hint rather than a mass, so the left half of the frame had nothing to
    // answer the right with.
    id: "cloud-drift",
    filter: "billow-b",
    opacity: 0.16,
    box: [350, 90, 550, 360],
    lobes: [
      [612, 269, 131, 98, 1],
      [714, 281, 103, 78, 1],
      [524, 277, 93, 73, 1],
      [622, 315, 160, 55, 0.45],
    ],
  },
  {
    // DOMINANT. Crosses the upper right, and it used to cross the middle right.
    //
    // It was carrying 47% of the field's visual weight on its own — 61% with
    // the companion — with both centred at x≈1530 of 1600. The mass-weighted
    // centroid sat at x 1192, three quarters of the way to the right edge,
    // against the x 792 the note above still claims. Radii are down a fifth
    // and opacity from 0.28, which is what brings the pair to ~41%.
    //
    // The reason it sat right is also gone. The note below explains the weight
    // as a counterbalance to "the navigation rail, a heavy object permanently
    // parked on the left" — the rail became a card across the top, so the sky
    // has been balancing against something that is not there.
    //
    // Lifted as well as shrunk. At 1470px the viewBox crops to x 65-1535, so a
    // mass centred at 1530 showed only its left flank, which read as a bright
    // wall down the whole right edge rather than as a body with a top and a
    // bottom. Centred at 1450 it keeps a silhouette.
    id: "cloud-dominant",
    filter: "billow-a",
    opacity: 0.22,
    box: [1120, 90, 700, 470],
    lobes: [
      [1453, 298, 156, 116, 1],
      [1583, 323, 124, 96, 1],
      [1313, 328, 116, 92, 1],
      [1468, 398, 200, 74, 0.5],
      [1343, 388, 120, 56, 0.45],
    ],
  },
  {
    // COMPANION. Its position was searched for inside the relationship rather
    // than chosen: the only free parameter was where on the 0.55-0.85 overlap
    // ring it could sit without touching sky-borne text and while keeping half
    // its area visible. One answer came back.
    // Moved and shrunk with the dominant so the relationship survives: centres
    // 175 apart against 260 of combined radii is 0.67, inside the 0.55-0.85
    // band this position was originally solved for.
    id: "cloud-companion",
    filter: "billow-b",
    opacity: 0.19,
    box: [1220, 340, 540, 340],
    lobes: [
      [1482, 483, 104, 78, 1],
      [1592, 497, 81, 65, 1],
      [1377, 501, 75, 61, 1],
      [1507, 547, 129, 48, 0.5],
    ],
  },
  {
    // DISTANT. Far corner, faintest, and the only mass whose job is depth
    // rather than mass. 0.85 of the frame diagonal from the dominant, which is
    // the minimum at which two clouds stop looking related.
    //
    // Moved 200 units right and raised from 0.17. It was placed with a third of
    // its area off the left edge and the rest of it behind the watchlist panel,
    // so the one mass whose job was to say "there is more sky than this" was
    // the one nobody could see. Still a corner mass, still the faintest.
    id: "cloud-distant",
    filter: "billow-b",
    opacity: 0.2,
    box: [40, 700, 500, 300],
    lobes: [
      [280, 850, 110, 84, 1],
      [380, 862, 84, 66, 1],
      [190, 858, 79, 64, 1],
      [290, 898, 136, 51, 0.45],
    ],
  },
];

// The two masses that drift. Both are the FAR layer by their own authored
// role — HAZE is atmosphere "felt and not seen", DISTANT is the corner mass
// "whose job is depth" — so moving them reads as air at a distance rather than
// as weather sliding across the page. The three near masses, and every star,
// stay exactly where they are.
const FAR_CLOUDS = new Set(["cloud-haze", "cloud-distant"]);

// The cloud machinery, written once and rendered into two SVGs: the static sky
// and the drifting far layer. Each SVG carries its OWN defs under a suffix
// rather than reaching into the other's by id. A cross-SVG url(#…) does
// resolve in current engines, but it ties the far layer's rasterisation to a
// document it is deliberately separated from — the point of the split is that
// the two are independent textures.
function CloudDefs({
  suffix,
  clouds,
}: {
  suffix: string;
  clouds: typeof CLOUDS;
}) {
  return (
    <>
      {/* Lit at the top, shadowed at the base. Applied per mass rather than
          across the whole canvas, so every cloud has an underside — which
          is most of what separates a cloud from a glow. */}
      <linearGradient id={`cloud-tint${suffix}`} x1="0.15" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stopColor="#4a83e6" />
        <stop offset="42%" stopColor="#1d4fa4" />
        <stop offset="100%" stopColor="#142b56" />
      </linearGradient>

      {/* One lobe. Solid at the core, gone at the rim — the softness is in
          the gradient, so the displacement below has something continuous
          to push around instead of a hard edge to tear. */}
      <radialGradient id={`lobe${suffix}`}>
        <stop offset="0%" stopColor="#fff" stopOpacity="1" />
        <stop offset="45%" stopColor="#fff" stopOpacity="0.82" />
        <stop offset="100%" stopColor="#fff" stopOpacity="0" />
      </radialGradient>

      {/* The billow. `feDisplacementMap` pushes the authored silhouette
          around by a fractal instead of building the silhouette out of one,
          which is the whole difference between a cloud and fog. Two seeds
          and two scales so four masses do not read as one stamp repeated. */}
      <filter
        id={`billow-a${suffix}`}
        x="-30%"
        y="-30%"
        width="160%"
        height="160%"
        colorInterpolationFilters="sRGB"
      >
        <feTurbulence type="fractalNoise" baseFrequency="0.0034" numOctaves="4" seed="23" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="120" xChannelSelector="R" yChannelSelector="G" />
        <feGaussianBlur stdDeviation="13" />
      </filter>
      <filter
        id={`billow-b${suffix}`}
        x="-30%"
        y="-30%"
        width="160%"
        height="160%"
        colorInterpolationFilters="sRGB"
      >
        <feTurbulence type="fractalNoise" baseFrequency="0.0052" numOctaves="4" seed="71" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="95" xChannelSelector="R" yChannelSelector="G" />
        <feGaussianBlur stdDeviation="10" />
      </filter>

      {clouds.map((c) => (
        <mask key={c.id} id={`${c.id}${suffix}`} maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1000">
          <g filter={`url(#${c.filter}${suffix})`}>
            {c.lobes.map(([cx, cy, rx, ry, o], i) => (
              <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#lobe${suffix})`} fillOpacity={o} />
            ))}
          </g>
        </mask>
      ))}
    </>
  );
}

// Opacity caps each mass, and these numbers are load-bearing: together they
// set the brightest field a panel can ever sit in front of, which is what
// --color-canvas is the composite of and what every contrast pair in the
// product is measured against. Raising any of them without re-running the
// harness invalidates all of them. Swaying a far mass does not raise a peak:
// it moves at most 3px, and the two far masses are the faintest in the sky.
function CloudMasses({
  suffix,
  clouds,
}: {
  suffix: string;
  clouds: typeof CLOUDS;
}) {
  return (
    <>
      {clouds.map((c) => (
        <g key={c.id} mask={`url(#${c.id}${suffix})`} opacity={c.opacity}>
          <rect x={c.box[0]} y={c.box[1]} width={c.box[2]} height={c.box[3]} fill={`url(#cloud-tint${suffix})`} />
        </g>
      ))}
    </>
  );
}

// Shared by every star SVG layer so each one crops exactly like the others.
// `slice` scales the field to cover the viewport and crops the excess, so
// stars stay round at every aspect ratio; `none` would stretch them into
// ellipses on a wide laptop.
const SVG_FRAME = {
  viewBox: "0 0 1600 1000",
  preserveAspectRatio: "xMidYMid slice",
  className: "size-full",
  focusable: "false",
} as const;

// --- Depth ----------------------------------------------------------------
// The sky is a stack of layers at three depths, each its own element so it can
// be moved as a compositor transform without re-rasterising anything:
//
//   far   — the far cloud masses and the dust stars   (depth-far)
//   —     — the near cloud masses: STATIC, and the one layer carrying the
//           heavy fractal filters, so it is rasterised once and never moved
//   mid   — the dim stars                              (depth-mid)
//   near  — the bright stars, which also twinkle       (depth-near)
//
// All three depths sway on one shared period and differ only in how far they
// travel — the nearer, the further. That ratio is what the eye reads as depth:
// one slow camera drifting past a field, rather than three layers moving
// independently. The sizes and brightnesses that already separate the tiers
// (dust 1.2-1.8 units at 0.16-0.32, dim 2.2-3.2 at 0.30-0.55, bright 3.0-4.2 at
// 0.57-0.79 with a halo) are the other half of the cue and are left exactly as
// measured. See `depth-*` in globals.css for the amounts and what stops them.
export function NightSky() {
  const far = CLOUDS.filter((c) => FAR_CLOUDS.has(c.id));
  const near = CLOUDS.filter((c) => !FAR_CLOUDS.has(c.id));

  return (
    <div className="night-sky" aria-hidden>
      {/* Far weather. Painted first, as it was in the single SVG this stack
          replaces: nothing is ever dimmed by haze passing in front of it. */}
      <div className="sky-layer depth-far">
        <svg {...SVG_FRAME}>
          <defs>
            <CloudDefs suffix="-far" clouds={far} />
          </defs>
          <CloudMasses suffix="-far" clouds={far} />
        </svg>
      </div>

      {/* Near weather — static on purpose. Its two fractal filters are the
          expensive part of the whole sky, and a layer that never moves is a
          texture that is rasterised once and then only composited. */}
      <div className="sky-layer">
        <svg {...SVG_FRAME}>
          <defs>
            <CloudDefs suffix="" clouds={near} />
          </defs>
          <CloudMasses suffix="" clouds={near} />
        </svg>
      </div>

      {/* Silver, not blue-white. The sky around them is blue enough that a
          blue star disappears into its own weather; a neutral, faintly cool
          metal is what separates the two, and the separation is the point —
          these two materials are the whole palette of the field.

          Dust sits with the far weather in depth but above the near clouds in
          paint order, where it always was. */}
      <div className="sky-layer depth-far">
        <svg {...SVG_FRAME}>
          <g fill="#c9d0dc">
            {DUST.map(([cx, cy, r, o], i) => (
              <circle key={i} cx={cx} cy={cy} r={r} opacity={o} />
            ))}
          </g>
        </svg>
      </div>

      <div className="sky-layer depth-mid">
        <svg {...SVG_FRAME}>
          <g fill="#dde3ec">
            {DIM.map(([cx, cy, r, o], i) => (
              <circle key={i} cx={cx} cy={cy} r={r} opacity={o} />
            ))}
          </g>
        </svg>
      </div>

      {/* The bright stars are HTML rather than SVG, and that is the whole
          performance story of the twinkle. It used to animate the opacity of
          <g> elements INSIDE the sky's one cached SVG, and an SVG group is not
          composited on its own — every cycle dirtied the shared layer and threw
          its texture away, continuously, which is why the twinkle had to be
          switched off on A14 hardware. As eighteen small elements, each opacity
          change is applied by the compositor to a texture it already holds.

          `sky-slice` reproduces `xMidYMid slice` in CSS — a 16:10 box that
          covers the sky and is centred on it — so a star at viewBox (x, y)
          lands on the same pixel it did in the SVG. Sizes are in `cqw`
          against that box: 1cqw is 16 viewBox units.

          Each star is its core and its halo drawn as one radial gradient,
          matching the two circles it replaces: a solid core of radius r at the
          star's opacity, and a halo out to 6r starting at a quarter of it. */}
      <div className="sky-layer depth-near">
        <div className="sky-slice">
          {BRIGHT.map(([cx, cy, r, o], i) => (
            // Cycle length and phase are derived from the index rather than
            // randomised, so the sky stays byte-identical between renders like
            // every other value in this file. 6.2s to 11.6s, and a NEGATIVE
            // delay so each star starts part-way through its own cycle — with
            // positive delays they would all begin dark together on the first
            // paint, which is the one moment a visitor is looking.
            <span
              key={i}
              className="sky-star star-breathe"
              style={{
                left: `${(cx / 1600) * 100}%`,
                top: `${(cy / 1000) * 100}%`,
                width: `${(r * 12) / 16}cqw`,
                height: `${(r * 12) / 16}cqw`,
                background: `radial-gradient(circle closest-side, rgb(244 246 250 / ${o}) 0 16.667%, rgb(231 235 242 / ${(0.25 * o * 5) / 6}) 16.667%, rgb(231 235 242 / 0) 100%)`,
                "--star-dur": `${6.2 + (i % 7) * 0.9}s`,
                "--star-delay": `-${(i * 1.37).toFixed(2)}s`,
              } as CSSProperties}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
