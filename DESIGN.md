---
name: US TechMarket
description: A composed, after-hours reading surface for what happened to US technology stocks today.
colors:
  primary: "#6695ff"
  primary-active: "#8db0ff"
  primary-fill: "#1e5fe0"
  primary-fill-hover: "#1a52c4"
  semantic-up: "#24c98a"
  semantic-down: "#ff6672"
  weather: "#1a4fc4"
  tint-primary: "#1d2d4e"
  tint-up: "#173145"
  tint-down: "#292943"
  accent-edge: "#2f477a"
  chart-bar: "#7c8dab"
  ink: "#f2f4f7"
  body: "#aeb7c8"
  muted: "#9ca6b9"
  backdrop: "#01040c"
  canvas: "#16243f"
  surface-soft: "#1c2f52"
  surface-strong: "#2b3f6c"
  hairline: "#25395e"
  edge-strong: "#6b80ad"
  logo-plate: "rgb(226 230 237 / 0.85)"
  glass-rail: "rgb(7 17 40 / 0.22)"
  glass-panel: "rgb(15 30 60 / 0.42)"
  glass-quiet: "rgb(12 24 50 / 0.2)"
  glass-raised: "rgb(24 43 78 / 0.34)"
  pane-veil: "rgb(1 4 12 / 0.45)"
  glass-overlay: "rgb(14 28 56 / 0.82)"
  glass-control-hover: "rgb(34 56 98 / 0.52)"
  glass-edge: "rgb(150 190 255 / 0.07)"
  glass-lift: "rgb(150 190 255 / 0.07)"
  solid-rail: "#142038"
  solid-raised: "#192845"
  solid-overlay: "#101e39"
  solid-logo-plate: "#c3c9d3"
  saturn-cream: "#e4cc9c"
  saturn-gold: "#cfa562"
  saturn-tan: "#a17c4c"
  saturn-grey: "#8b8274"
  saturn-ring: "#ded7c8"
  saturn-ring-cool: "#9d9b97"
  saturn-glow: "#f0dfb4"
typography:
  display:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "clamp(2.25rem, 4vw, 3.25rem)"
    fontWeight: 600
    lineHeight: "1.06"
    letterSpacing: "-0.012em"
  figure:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "1.875rem"
    fontWeight: 500
    lineHeight: "1.05"
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "-0.025em"
  lede:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: "1.55"
    letterSpacing: "0.003em"
  analysis:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.625"
  story:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.375"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
  micro:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
rounded:
  container: "24px"
  overlay: "16px"
  row: "12px"
  nav: "8px"
  pill: "9999px"
spacing:
  shell: "24px"
  shell-phone: "16px"
  section: "40px"
  panel-x: "20px"
  panel-y: "16px"
  cell: "12px"
components:
  panel:
    backgroundColor: "{colors.glass-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.container}"
    padding: "16px 20px"
  panel-raised:
    backgroundColor: "{colors.glass-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.container}"
    padding: "24px 32px"
  panel-quiet:
    backgroundColor: "{colors.glass-quiet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.container}"
    padding: "16px 20px"
  story-card:
    backgroundColor: "{colors.glass-quiet}"
    textColor: "{colors.ink}"
    typography: "{typography.analysis}"
    rounded: "{rounded.container}"
    padding: "24px"
  panel-overlay:
    backgroundColor: "{colors.glass-overlay}"
    textColor: "{colors.body}"
    rounded: "{rounded.overlay}"
    padding: "4px"
  panel-rail:
    backgroundColor: "{colors.glass-rail}"
    textColor: "{colors.body}"
    rounded: "{rounded.container}"
    padding: "8px 16px"
    height: "62px"
  panel-control:
    backgroundColor: "{colors.glass-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  panel-control-hover:
    backgroundColor: "{colors.glass-control-hover}"
  panel-chip:
    backgroundColor: "{colors.glass-panel}"
    textColor: "{colors.body}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  nav-item:
    textColor: "{colors.body}"
    rounded: "{rounded.nav}"
    padding: "12px 12px"
    height: "44px"
  nav-item-hover:
    backgroundColor: "{colors.glass-lift}"
    textColor: "{colors.ink}"
  nav-item-active:
    textColor: "{colors.primary-active}"
    rounded: "{rounded.nav}"
  filter-pill:
    textColor: "{colors.body}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  filter-pill-active:
    textColor: "{colors.primary-active}"
    rounded: "{rounded.pill}"
  button-primary:
    backgroundColor: "{colors.primary-fill}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-fill-hover}"
  badge-significant:
    backgroundColor: "{colors.tint-primary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  badge-normal:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.body}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  menu-row:
    textColor: "{colors.body}"
    rounded: "{rounded.row}"
    padding: "8px 12px"
  menu-row-selected:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.primary-active}"
    rounded: "{rounded.row}"
---

<!-- Refreshed 2026-10-05 by /impeccable document from the working tree of feat/space-ui (on 3e25225, with the Saturn scene, the card-by-card arrival and the three glass weights still uncommitted). The source of truth is src/app/globals.css and src/components; if this file and the code disagree, the code wins and this file is stale. -->

# Design System: US TechMarket

## Overview

**Creative North Star: "Midnight Glass"**

The market has closed. The numbers have stopped moving, the day is complete, and what is left is a desk under a window at night: clear panes of glass laid over a black sky with one planet in it. That room explains every decision below. There is **one theme** and it is a night. The surfaces are **translucent rather than painted**. **Nothing that carries information moves.** A product whose whole premise is "here is what happened today" would be lying with its motion if it behaved like a live tape.

The sky is authored in `night-sky.tsx`: near-black space and silver points in four tiers, from 700 sub-pixel far points that give the black its distance down to eighteen bright stars. The blue fractal clouds it used to carry are gone. With a lit planet as the focal object they were a second subject, and the stars, drawn large enough to read through glass, read as dust. **Saturn** (`saturn-scene.tsx`, rendered in WebGL by `saturn-webgl.ts`) is the one object in the sky and the only warm material in the product. It is placed per route, cropped by the frame, and always behind the panes. Phones have no planet.

Everything else is a pane in front of it. The panes are **clear, not frosted**: no `backdrop-filter`, because fourteen per-frame Gaussian passes made A14 iPhones and iPads drop whole panes mid-scroll. Blur survives only on the overlay menu. Glass comes in **three weights for three jobs**: the shell is the thinnest, panes holding the session's figures are the densest, and secondary panes (stories, events, timeline, teaser) are nearly clear. A pane's face is a *range*, and every colour pair is measured at the bright end of it. Over the planet, legibility is held by the planet's own shade, which darkens it under every pane and line of text.

The sky is the room, and the room may move. Three star depths sway together on one slow 40s period. The bright stars breathe, a fine pointer brightens the stars near it, and clicking a bright star draws a brief constellation. On a route change the camera travels to the next route's view of the planet, the star depths swinging with it, and two meteors cross. None of this sits under content, and none of it ever touches a price, a badge, a rank or a line.

**Key Characteristics:**
- One theme: a midnight sky with clear glass over it. No daylight counterpart exists or is wanted.
- One planet, behind every pane, never behind a figure, a sparkline or a chart, and dimmed wherever something is read.
- Translucent surfaces over an authored sky, never flat plates with a blue idea behind them.
- Exactly one translucent layer in any stack: the pane's own face. Everything nested inside it is baked opaque.
- Two type voices: a serif for what was *written*, a grotesque and a mono for what was *measured*.
- Data arrives once, card by card in reading order, and then holds still. Only the sky, the stars and the planet are ambient.
- Every contrast pair is measured at the worst-case composite, not estimated.

## Colors

A near-black sky with almost no red in it, one warm planet in it, blue glass in front of it, and a single light periwinkle accent that only ever means *active* or *significant*.

### Primary

- **Signal Blue** (`primary`): the only accent. It marks the Significant badge, inline links, the bullets in the AI Daily Summary, price-milestone and high-volume markers on the timeline, and the focus ring on every control. If Signal Blue appears, something is active, focused, or crossed a threshold.
- **Signal Blue Active** (`primary-active`): accent *text on an accent or raised plate*. Adding accent to a plate pulls the plate toward the text on it: `primary` on `surface-strong` measures 3.60:1 and fails, while `primary-active` measures 4.82:1. It is used on the active nav item, the active News tab and sector pill, and the selected row in every menu.
- **Signal Blue Fill** (`primary-fill`): the accent as a filled plate under white text (the skip link and the not-found action), at 5.57:1.
- **Signal Blue Fill Pressed** (`primary-fill-hover`): the hover for a filled plate, and the one accent token that goes **darker**. Hovering to `primary-active` under white text once measured 2.15:1.

### Secondary

- **Weather Blue** (`weather`): the deep blue the clouds were painted in, kept now that the clouds are gone. It is *light*, not state. It appears only as the corner glow (a `radial-gradient` in the story components) on each page's one raised card, the opening card of Market Story and of Today's Story.
- **The planet's palette** (`saturn-cream`, `saturn-gold`, `saturn-tan`, `saturn-grey` on the body; `saturn-ring`, `saturn-ring-cool` in the rings; `saturn-glow` for its haze and the light it throws on glass): natural, not blue. It is the one warm material in the product, and it is used by the planet and nothing else: no pane, tint, text or control takes it. The only blue on the planet is a hairline cool rim on its night limb, which is the glass below reflecting back up. The values are the planet *as lit*, far brighter than anything the contrast harness measured over, which is why it is shaded wherever something is read (see The Shade-Under-Reading Rule).

### Tertiary

- **Session Green** (`semantic-up`) and **Session Red** (`semantic-down`): gains and losses in the reported session. They colour change values, sparkline and intraday strokes and fills, the breadth bar, the diverging story-chart bars, and the market-open dot.
- **Three tinted plates** (`tint-primary`, `tint-up`, `tint-down`): the Significant badge and every change pill. They show the accent and the session pair as a *field* rather than a line, and are the only way colour occupies area inside a panel. **Accent Edge** (`accent-edge`) is the 1px inset ring those plates carry.

### Neutral

- **Ink** (`ink`): headings, tickers, primary values, the story prose, and anything the eye should land on first.
- **Body** (`body`): secondary prose, secondary figures, inactive nav, tabs and pills. 6.6:1 against the brightest panel face.
- **Muted** (`muted`): cell labels, timestamps, axis labels, provenance notes, section metas, the scrollbar thumb. The quietest readable tier, at 5.5:1. The secondary tiers carry blue on purpose: on a field this saturated, a neutral grey reads as washed out rather than quiet.
- **Chart Bar** (`chart-bar`): intraday volume bars only. These bars are data, so they answer to the 3:1 graphical-object floor.
- **Backdrop** (`backdrop`): the sky itself. Nearly black with a near-pure blue cast, and now the whole of the sky between the stars and the planet.
- **Canvas** (`canvas`): *not a colour anyone picked*. It was `glass-panel` composited over the brightest cloud a panel could sit in front of, and it is kept as the bright end of every pane's range now that the clouds are gone. Tints are baked over it, the reduced-transparency fallback paints it, and the contrast harness measures against it.
- **The three glass weights** (`glass-rail`, `glass-panel`, `glass-quiet`, with `glass-raised` for the one raised card): the rail is the thinnest pane (0.22) because it is shell; a pane holding the session's figures and charts is the densest (0.42), so the planet and stars behind it settle into a quieter ground; a secondary pane is nearly clear (0.2). All of them composite darker than `canvas` over the brightest sky.
- **Pane Veil** (`pane-veil`): the sky's own black at 45%, painted *under* each reading pane's tint. Over black sky it changes nothing; over a star or the planet it takes 45% off, so the far points that showed through text as specks read as a quieter field. The sky outside the panes keeps every star.
- **Surface Soft / Surface Strong** (`surface-soft`, `surface-strong`): surfaces *inside* a panel, such as chart wells, lettermark plates, the Normal badge and selected menu rows. Both are opaque, baked over Canvas, and step up in blue rather than grey.
- **Hairline** (`hairline`): internal rules only, including dividers, grid lines, the timeline rail and the summary's column rule.
- **Glass Edge / Glass Lift** (`glass-edge`, `glass-lift`): the same cold light at 7%, used as the pane's faint base border and as the hover fill for a control sitting *on* glass (nav items, tabs, pills). One token each, so the two places light lands on glass cannot drift apart.
- **Edge Strong** (`edge-strong`): the glass rim as a drawn line under `prefers-contrast: more`, at 3.27:1.
- **Logo Plate** (`logo-plate`): frosted, light, and the one object that must not darken. Brand marks arrive with hardcoded dark fills that vanish on anything dark.

### Named Rules

**The Worst-Case Composite Rule.** A pane's face is a range, not a value. Measure every contrast pair at the bright end of that range; if it passes there, every pixel passes. `canvas` is that bright end. The sky's peak behind a pane must be **measured off the rendered page**, not modelled, and re-taken after any change to the sky. It is currently conservative: the cloudless sky measures far darker than `canvas` assumes, which is the safe direction. The planet is the one thing brighter than `canvas` that can sit behind a pane, and it answers to its own rule below rather than to this one. Do not chase `canvas` downward without re-baking all three tints first. **A conservative canvas costs nothing; an optimistic one fails silently.**

**The Shade-Under-Reading Rule.** The planet is drawn at `--saturn-pane` of its brightness behind a pane (1 by default, 0.7 behind News's list), at `--saturn-glass` (0.26) under any line of text, figure, chart or control on a pane, and at `--saturn-bare` (0.18) under anything read on the open field. The shade starts with the element it sits under: a card still arriving casts no shade, and its shade fades in with its own entrance. **Lightening a planet colour, or raising any of the three shares, needs the contrast re-measured over the rendered planet.**

**The Two Blues Rule.** **Signal Blue** is light, saturated, always sits *on* a surface, and means only "active" or "significant". **Weather Blue** is deep, appears only as the corner light of the one raised card, and never marks a state. Test: a blue inside a panel's content is a state; a blue glow in a card's corner is light.

**The Warm Planet Rule.** Warmth belongs to Saturn alone. Its palette never reaches a pane, a tint, a text colour or a control, and the planet's light reaches the glass only as a 1px warm catch on the rims nearest it. A warm object anywhere else would make the planet one of several things instead of the one thing in the sky.

**The One Translucent Layer Rule.** Exactly one layer in any stack is translucent: the pane's own face. **A plate's material is decided by what is behind it, not by what it is.** On the bare field, use glass (`panel-control`, `panel-chip`). Inside a panel, use the baked token.

**The Baked Tint Rule.** A tinted plate is a flat token, never an alpha (`bg-primary/8`). An alpha composites against whatever is behind it, and behind it is a gradient. The three tints are pre-composited at 8% over Canvas. This pair fails first whenever the glass or the sky changes, so re-run it first.

**The Climbing Ramp Rule.** A surface that sits on another surface is the lighter of the two. The one sanctioned exception is `panel-rail`: it is shell, and shell stays recessive relative to content.

**The Always-Light Plate Rule.** `logo-plate` stays light on purpose. Real marks sit on it; lettermark fallbacks use `surface-strong` so their text stays legible. Its alpha is safe because at 0.85 the backdrop moves it by about 3 RGB units.

**The One Meaning Per Hue Rule.** A hue already carries a meaning here, so an *action* may not borrow it. Red means "a price fell" and Signal Blue means "crossed the rule". A red Remove or a blue Add would sit beside those in the same viewport and say something else. Carry an action's meaning with a glyph or a word in Body ink. **Before colouring anything, ask what that hue already says on this screen.**

**The Reverted-On-Sight Rule.** Two changes were made twice and undone twice. Do not re-propose either without new evidence.
- **The Volatility card in neutral ink.** VIXY is an ETF with a price; when it falls, red reports that fact exactly as on the other cards. The "calmer market" reading is the viewer's inference, and one card in a different colour reads as a fault.
- **"Normal" replaced with a dash.** Most days nothing crosses the rule, so a dashed status reads as data that failed to load. **A quiet answer still has to look like an answer.**

**The Measured Floor Rule.** A colour pair ships only once its ratio has been computed: 4.5:1 for text, 3:1 for a graphical object that carries data. `muted`, `body`, `chart-bar`, all three tints and `primary-active` are the values they are because the prettier value failed.

## Typography

**Display Font:** Source Serif 4 (with ui-serif, Georgia, serif)
**Body Font:** Inter (with ui-sans-serif, system-ui, sans-serif)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, Menlo, Consolas, monospace)

**Character:** A financial paper's evening edition, not a terminal. The product's output is written prose (a daily summary, a card-by-card analysis, summarised news), so a serif carries the words and a grotesque carries the instruments. Source Serif 4 was chosen because it is drawn for screens, is sober, and is variable, so the whole weight range costs one file.

### Hierarchy

- **Display** (Source Serif 4, 600, `clamp(2.25rem, 4vw, 3.25rem)`, 1.06): at most one per page, set through the `page-title` utility. Only News, `error.tsx` and `not-found.tsx` use it. On News it arrives with `line-rise` (see Motion); on the two error pages, which have no page arrival, it takes `title-resolve`, a mask sweeping across the intact line. **Market has no display element**: its `<h1>` is `sr-only`, and the session is already named in the shell. **Stocks has none either**: its `<h1>` is a ticker, set in Inter as a measured identifier.
- **Figure** (JetBrains Mono, 500, 1.875rem, 1.05, `tnum`): the one large tabular reading, used in Market Overview levels and the Stocks stat cells. Both import the step rather than spelling a size.
- **Title** (Inter, 600, 1.25rem): every section heading, always through `SectionHeading` with the hairline running to the meta slot.
- **Lede** (Source Serif 4, 400, 1.125rem, 1.55, +0.003em): the AI Daily Summary ("What Happened Today"), which is the longest passage. It has no measure cap; the card takes a second column instead (see The Filled Right Rule).
- **Analysis** (Source Serif 4, 400, 1rem, relaxed, Ink): the text half of every story card (Today's Story and Market Story), via `SectionCard`.
- **Story** (Source Serif 4, 600, 1rem, 1.375): news headlines on News and in the Market teaser. A headline is one role and must not change between two surfaces.
- **Body** (Inter, 400, 0.875rem, 1.5rem): interface prose, summary bullets, straplines. Measure caps run 48–60ch, each derived by measuring its passage.
- **Label** (Inter, 600, 0.75rem): cell labels, tab labels, sector pills.
- **Micro** (Inter, 600, 0.6875rem): second lines inside a cell, badges, the session marker, lettermarks.

### Named Rules

**The Written-And-Measured Rule.** What somebody or something *wrote* is set in the serif. What the machine *measured* is set in Inter or mono. **The face follows the role the element plays, not the kind of value it holds**: the session date is mono in the shell marker, because there it is a stamped reading, not a title.

**The Mono Numerals Rule.** Every number that is *data* renders in JetBrains Mono with `tabular-nums`. A figure set in Inter is a defect.

**The Same-Width Fallback Rule.** Until JetBrains Mono arrives, figures render in the platform's own monospace, never in a metric-adjusted Arial. Monospaced faces share the 0.6em advance, so the swap cannot change a line break; the adjusted Arial ran digits 16% wide and dropped the Stocks badge to a second line and back (CLS 0.108, now 0).

**The Signed Value Rule.** Change values always carry an explicit `+` or `−` (U+2212, not a hyphen) and are formatted from the absolute value, so direction is legible without colour.

**The Dark-Compensation Rule.** Light-on-dark bleeds and tightens. `lede` carries +0.003em tracking and open leading for this, unlayered so it beats utilities. Weight is left at 400; 500 would match the figures around it.

**The Measure-On-The-Text Rule.** A `ch` cap belongs on the element whose font size it describes, never on a wrapper. And `ch` is the advance of a zero, not a character: 52ch of Inter holds about 68 characters. Derive caps by measuring.

**The Intact Heading Rule.** Never split a heading into per-character boxes to animate it; kerning does not survive across boxes. Animate an intact text node: a line rising through a clip (`line-rise`) or a mask travelling across it (`title-resolve`). The one sanctioned split is the page's short lede, word by word (`WordReveal`), because a word is the unit read anyway; never a headline, a summary or a story.

## Layout

One centred group, `max-w-[1680px]`, stacked as a column: the nav card, then `<main>`. The shell owns every gutter. Padding and the gap under the nav card are the same value, `16px` below 600px and `24px` above. That is the only responsive step in the shell. Pages set **no horizontal padding of their own**. `<main>` carries `min-w-0`, which is load-bearing: without it a flex item cannot shrink below its content, and every `overflow-x-auto` island widens the page instead of scrolling.

The nav card holds three things: the nameplate (hidden below 600px), the session marker, and the nav (Market, Stocks, News). All three sit on one 62px row at 1000px and above. Below 1000px the marker takes its own row (`w-full order-last`). A name with the date beneath it is a masthead arrangement, not a fallback.

Sections stack at a `40px` rhythm (`gap-10`). Every section opens with a `SectionHeading` row of at least `38px` (the height of a `panel-control` pill), so sections side by side start level.

**Route composition, top to bottom:**

| route | order |
|---|---|
| Market `/` | date picker (right) → Session Digest → Market Overview (6 cards) → Market Story (8 sections) → Market News teaser (3 up) |
| Stocks `/todays-activity/[symbol]` | header (logo, ticker switcher, date picker, price, change, badge) → past-session note (a past day only) → 7 stat cards → What Happened Today → Price & Volume + Upcoming Events → Timeline → Today's Story sections |
| News `/news` | display title → Stock/Market tabs + date picker → sector pills (Stock only) → article list |

Breakpoints are derived from the shell arithmetic, not taken from Tailwind's stock scale, and each one carries its arithmetic in a comment at the call site. The surfaces that take a second column:

| surface | at | split |
|---|---|---|
| Story card (text / chart) | `600px` | two equal halves, centred |
| Stocks header | `680px` | logo · identity · controls |
| AI Daily Summary | `1050px` | `1fr` + `30rem` bullet rail |
| Price & Volume / Upcoming Events | `1130px` | `minmax(0,1fr)` + `minmax(300px,360px)` |
| News list | `1130px` | two equal columns, dividers per cell |
| Timeline | `1130px` | two columns, **split in the server component** |
| Market News teaser | `768px` (`md`) | three across |

The two card grids step `2 → 3` at 600px and then go wide at `xl`: **Market Overview** to 6 across and **Activity Stats** (7 cards) to 4 across.

Designed widths are laptop, iPad (820 and 1180pt for the 10th gen) and phone (390). `documentElement.scrollWidth` must equal the viewport on every route at 390 / 430 / 600 / 768 / 834 / 1024 / 1130 / 1280 / 1470 / 1920.

### Named Rules

**The Scrolling Island Rule.** Anything with a hard minimum width (the 560px intraday chart) lives in its own `overflow-x-auto` container and scrolls internally. The page body never scrolls sideways. **A scrolling island must say so in words** at the widths where content is off screen, because iPadOS hides the scrollbar.

**The One Container Rule.** Every page renders directly into the shell's group. A page that sets its own width or horizontal padding is drifting.

**The Orphaned Card Rule.** When a card count does not divide the column count, **let the last card be orphaned**. Never span it across the remainder: an empty cell reads as an empty cell, while a card twice its neighbours' width reads as a mistake. Check a grid at every column count it passes through, at the device's real width.

**The Mirrored Grid Rule.** Each card grid string exists in its component and its route's `loading.tsx` skeleton, and the two must be byte-identical. A skeleton that disagrees snaps on arrival, which is worst on exactly the slow connection a skeleton exists for.

**The Lone Wrapped Item Rule.** `justify-between` places a lone wrapped item at the start. Any `flex-wrap` row whose right-hand item can wrap needs an explicit `ml-auto` (or a grid). A whitespace-only text node is not rendered as a flex item, so an `inline-flex` container can delete a space from the rendering and the accessible name. Wrap the label in one element.

**The One Axis Rule.** A stacked header has one left *visual* axis. The Stocks header is a grid with the logo in column one and everything else down column two, and the axis comes from the logo's width, not a hardcoded indent. If the controls carry `px-2`, the column below carries it too. When "NVIDIA · session of" and its date picker wrap onto two lines, the picker starts the second line on that axis rather than sitting at the far right, so the phrase still reads as one sentence.

**The Planet's Room Rule.** Each route's view of Saturn is composed per device class against the measured rectangles of that route's panes, figures and charts at scroll 0. The planet may sit behind a pane's edge, a caption or a heading, **never behind a figure, a sparkline or a chart**. A layout change that moves a figure into the planet's body needs that route's view recomposed (`--saturn-x`, `--saturn-y`, `--saturn-scale` in globals.css), not a brighter shade.

**The Filled Right Rule.** A full-width panel whose content is capped at a reading measure has a second column's worth of empty space. Spend that width with a second column rather than reclaiming it with a narrower measure. The exception is a short list: two columns of three rows is an arrangement, not a composition.

## Elevation & Depth

The system is **layered and lit**, not flat. Depth comes from three sources at once: a tonal climb (each surface lighter than its field), a soft cast shadow, and a directional **lit rim** where the pane catches the sky. Shadows are always a tight contact shadow plus a wide ambient one. Alphas are high because the field is near-black. **No panel carries a coloured glow**: a pane does not emit, and a halo per card would put the light source wherever the layout happened to place a card.

### Shadow Vocabulary

- **elev-0** (`0 1px 2px rgb(0 0 0 / 0.35), 0 3px 10px -4px rgb(0 0 0 / 0.4)`): a secondary pane (`pane-quiet`), a seam and a short cast, so it sits nearer the sky than the panes holding figures.
- **elev-1** (`0 1px 2px rgb(0 0 0 / 0.45), 0 4px 14px -3px rgb(0 0 0 / 0.5)`): resting panels, tracks, controls on the field.
- **elev-2** (`0 2px 6px rgb(0 0 0 / 0.5), 0 16px 34px -10px rgb(0 0 0 / 0.6)`): the nav card, the raised card, and a `lift` card under the pointer.
- **elev-3** (`0 6px 12px rgb(0 0 0 / 0.55), 0 30px 60px -14px rgb(0 0 0 / 0.7)`): overlays only.

**The lit rim** (`--edge-rim`) is a masked 1px gradient ring, not a border: brightest at the top-left corner (the side the sky is lit from), gone by mid-pane, with a faint catch at the far corner. It has **three strengths, one per plane**: `--edge-rim-quiet` on the shell and on secondary panes, `--edge-rim` on a resting panel, and `--edge-rim-lit` on the raised card, any `lift` card while hovered or focused, and every overlay menu, the nearest plane of all. With blur gone, the rim is the depth cue that says which pane is nearer. Its pseudo-element radius is the tier's radius **plus one**.

**The planet's light on the glass.** Over the rim, a warm catch (`saturn-glow` at up to 70%) lands on the stretch of edge that faces Saturn: full where the edge is nearest the planet and gone a planet's radius further along. `saturn-stage.tsx` writes where the planet is relative to each pane (`--catch-x`, `--catch-y`, `--catch-d`, `--catch-r`, `--catch`), so only panes near the planet catch it and no two are lit alike. It comes up over 500ms where it lands and goes out in 180ms while the page moves (`data-scrolling`, `data-traveling` on the root), then is placed again at rest. It is on the 1px edge only, never under a glyph.

**The secondary pane** (`pane-quiet`, applied beside `panel`, never alone) sets the panel's own variables rather than its properties: the nearly clear `glass-quiet` fill, no face wash, the quiet rim and `elev-0`. Story sections, the news teaser, upcoming events, the timeline and notes take it, so the eye finds the panes holding figures first.

**The veil** (`pane-veil`) is the background colour of every reading pane, painted beneath its tint. It is why stars behind a pane read as a quieter field rather than as specks through the text.

**The face wash** (`--surface-face`) is 7% of the same cold blue over the top 96px. It must stay translucent, and its brightest band is included in every contrast pair (the worst case for text is the top of a raised card).

**Depth inside a panel**, one utility per idea, so a component applies a name rather than re-spelling a shadow:
- `well`: a channel cut into the pane (`surface-soft` plus an inset shade on its top edge). Used by chart tracks, the breadth bar, and range bars.
- `lit-fill`: a data fill standing proud of its well, lit on top and shaded at the bottom. The hue underneath is untouched.
- `plate-object` / `plate-object-dark`: a logo or lettermark plate resting on the glass, with a contact shadow and a top catch of light (white on the light plate, blue on the dark one). Without it a plate reads as a hole in the pane.
- `lift`: a card carrying a link rises 2px, takes `elev-2` and the lit rim on hover (hover-capable pointers only) and on `:focus-within`. It is used only where the card really is a link.
- `press`: a small control on glass sinks 1px while held. Nothing happens at rest.
- `nav-active`: the one sanctioned alpha plate, an 18% accent with a lit inset ring and a soft Signal Blue under-glow (`0 2px 16px -6px` at 50%). It is a control, not a pane, so the no-glow rule for panels does not cover it, and it is the only coloured outer shadow in the product. It is measured at both ends of its range: `primary-active` clears 5.43:1 at the bright end.

### Named Rules

**The Clear Glass Rule.** Panes are translucent but **not frosted**: `panel`, `panel-raised`, `panel-track`, `panel-track-block`, `panel-rail`, `panel-control` and `panel-chip` all carry `backdrop-filter: none` and keep their alpha (the blur tokens still exist in the utilities and are switched off by this one list). Blur is the one property that costs per pixel per frame, and on A14 hardware it made whole panes drop out mid-scroll. **`panel-overlay` is the single exception**: what shows through it is text, and unfrosted text ghosts through a dropdown. Do not reintroduce blur on a scrolling surface.

**The One Material Rule.** Containers are built by applying a material utility (`panel`, `panel-raised`, `panel-overlay`, `panel-track`, `panel-track-block`, `panel-rail`, `panel-control`, `panel-chip`), never by hand-assembling background, border, radius and shadow. **A component that inlines the recipe is drift even when it looks identical.** If it needs a variant, add one to the utility.

**The Every-Tier Fallback Rule.** Three tiers turn the glass off or harden it: the clear-glass list, `prefers-reduced-transparency` (repaints each tier solid), and `prefers-contrast: more` (draws the rim as `edge-strong`). Each one must name **every** material utility. A new variant goes into all three in the same change.

**The One Raised Element Rule.** At most one thing per page sits at `elev-2` on `panel-raised` (the nav card excepted as shell): the opening card of Market Story on Market, of Today's Story on Stocks. Two raised elements on one page say nothing.

**The Three Weights Rule.** A pane's weight follows what it holds, not where it is: the shell is thinnest, a pane holding the session's figures and charts is densest, and a pane holding writing or a list is `pane-quiet`. A new pane takes the weight of its content's role.

**The Two-Channel Depth Rule.** Never add a cast shadow without checking the tonal relationship underneath it. If the surface is not lighter than its field, the shadow is decoration.

## Shapes

Two radii and almost nothing in between. **Containers are 24px**: every panel, the nav card, the raised card, the story cards. **Tokens are full pills**: badges, change values, controls floating on the field, News tabs and sector pills. Inside an overlay the scale steps down concentrically: a `16px` pane holding `12px` rows on `4px` of padding. Navigation items are `8px`.

Borders are 1px and translucent where they meet the sky, and solid only where they land on a known panel face. Nothing uses a hard offset shadow, a coloured side border, or a clip-path silhouette.

### Named Rules

**The Pill-For-Tokens Rule.** A small object standing for a state, a category or an identity is a full pill. A container is 24px. There is no in-between at container scale.

**The Stadium-Is-One-Row Rule.** A full-pill track suits a segmented control on **one** row. Once it wraps, it is a block and takes the container radius (`panel-track-block`), or the first pill's corner pokes outside the track's shape. Test containment against the rounded outline by sampling points, not against the bounding rect, and prove the check can fail first.

**The Concentric Radius Rule.** A rounded thing inside a rounded thing takes the outer radius minus the padding between them.

## Components

### Buttons and Filters

- **Shape:** full pill on the field (`panel-control`), `12px` for a menu row, `8px` for a nav item.
- **Primary (filled):** Signal Blue Fill under white, `8px 16px`. Used only where an action must be found without context: the skip link and not-found. Hover goes **darker**.
- **Control (glass):** the default. `panel-control` hovers to `glass-control-hover`, glass that has caught more light, never an opaque plate.
- **Tabs and sector pills (News):** bare pills on the page, Body text, hovering to `glass-lift` with Ink text. Active is `nav-active` with Signal Blue Active text and `aria-current`. Every one uses `press`. Tabs grow to 44px on `pointer-coarse`. Sector pills keep their 24px face and, on `pointer-coarse`, extend their target 4px past every edge (32px): the most their 8px gaps allow without two targets overlapping.
- **Focus:** a 2px Signal Blue outline at 2px offset on every focusable element, 3px under `prefers-contrast: more`.
- **Disabled:** 50% opacity plus `cursor: not-allowed`, with the reason also written in words nearby.

### Chips and Badges

- **Style:** `panel-chip` on the field, a baked tint inside a panel. Full pill, `2px 10px`, micro label at 600.
- **State:** Significant takes `tint-primary` with Signal Blue text; Normal takes `surface-strong` with Body text. Change pills take `tint-up` / `tint-down` with the session pair. On the Stocks header, which sits on the bare field, the badge takes its glass variant (`onGlass`).

### Cards / Containers

- **Corner Style:** 24px.
- **Background:** `pane-veil` beneath `glass-panel` plus the face wash; `glass-quiet` with no wash for a secondary pane (`pane-quiet`); `glass-raised` for the one element that outranks its neighbours.
- **Shadow Strategy:** `elev-1`, `elev-0` for a secondary pane, `elev-2` for the raised card. See Elevation & Depth.
- **Border:** 1px `glass-edge` plus the masked lit rim.
- **Internal Padding:** `16px 20px` for data panels; `20px`, rising to `24px` at `sm`, for story cards; `24px`, rising to `32px`, for the raised card and the AI Daily Summary.

### Navigation

A card across the top, split to its two edges like a masthead. The product's name (display serif, text rather than a link) is on the left, the session marker in the middle, and three items on the right: **Market**, **Stocks**, **News**, with shortcuts `g m` / `g s` / `g n` declared in `aria-keyshortcuts` and not drawn. It uses the quiet `panel-rail` material, darker than content because it is shell.

The **session marker** states whether the market is open (dot plus word), which day is on screen, and when the data was read, in muted micro mono. It lives in the shell because all three facts are true on every route. It is server-rendered and handed to the client nav as a prop.

Items are 44px tall, `8px` radius, Body text with an 18px authored glyph at 1.5 stroke, hovering to `glass-lift`. The active item is `nav-active` with Signal Blue Active text, a 1.75 stroke (a second, non-colour channel) and `aria-current="page"`. Labels carry `whitespace-nowrap`. **Stocks** links straight to the first Top-20 stock rather than to `/todays-activity`, which only redirects and showed a skeleton for each route in turn; it is marked active on any stock page. The glyphs share one convention: 24×24 viewBox, `currentColor` stroke, round caps, no fill, each drawn as the thing it leads to.

**Not sticky, on purpose.** A pinned card has content passing underneath it, and it carries no entrance animation because it is the frame. The shortcuts cover switching from any scroll position.

### Menus and Disclosures

Every popover is `panel-overlay`: the one frosted surface (16px blur, 1.35 saturate), nearly opaque at 0.82, `elev-3`, `4px` padding around `12px` rows. It takes the brightest lit rim (`--edge-rim-lit`) and never the planet's catch, which would sit still while the planet pauses. A long menu scrolls its list, never the pane, or the rim scrolls away with the rows. It **comes out of the button that opened it** over 200ms: slightly small, a few pixels up, its clip opening downward from the top edge, and its blur rising from 2px to 16. Every row is live from the first frame. The trigger holds its lit state while the pane is open, so the two read as one object. The sky's sway and twinkle, and the planet's render, pause while any overlay is open.

Two client popovers exist. The **symbol switcher** (Stocks header) is a disclosure: the ticker is the button, and it opens a flat alphabetical list of the 20 tracked symbols as links, each ticker followed by its company name in muted 12px text, closing on outside click and on Escape (which returns focus). It implements no menu keyboard model, so, like the date picker, it declares no menu role or `aria-haspopup`; its trigger carries `aria-expanded` and `aria-controls` only. The **date picker** (Market, Stocks, News) is a disclosure of date links with outside-click and Escape handling. It declares no menu role because it does not implement the menu keyboard model. The selected row in either takes `surface-strong` with Signal Blue Active text.

### Story Cards and Charts

Today's Story (Stocks) and Market Story (Market) render each section as its own top-level block: a `SectionHeading`, then a `SectionCard`. The card is a `panel pane-quiet` with the AI's paragraph in the analysis serif on the left and, when the section has one comparable numeric scale, a chart of the same figures on the right. Above 600px the two are equal halves. The first section of each story (Worth Your Attention Today / Today's Market) is the page's one `panel-raised`.

Drafts are published rather than rejected, so the reader is told what the checks found. A card whose text carries a figure the input does not contain ends with a hairline and one muted line per finding, "Automated check: …" (`CheckNotes`), and says nothing when it passed. Once, under the last card of each story, a muted line (`StoryDisclosure`) says the text is written by AI from the data on the page, can be wrong, and that the checks flag figures rather than remove them.

The four charts, all in `story-charts.tsx`, draw only figures computed by the same functions the prompt was built from, so a chart and its sentence cannot disagree:
- `ComparisonBars`: a fixed set of rows (stock vs sector vs market vs peers) on a zero-centred diverging `well`, with `lit-fill` bars in the session pair.
- `RankedBars`: the same idea for a variable-length named list (movers, sectors). Its label column is as wide as its longest label, so a sector name is never cut to an ellipsis and a ticker row gives the room to its bars.
- `RangeBar`: where today's price sits in a trailing min–max range.
- `YtdChart`: a year-to-date line.

A lone single-instrument chart is wrapped in a label (for example "Technology (XLK)"), because unlike the ranked rows it names nothing itself. **A section earns a chart only when its content is one comparable scale.** News lists and macro series sharing no unit stay text.

### The AI Daily Summary

"What Happened Today" on Stocks, directly under the stat cards, so the answer sits beside the figures it explains rather than below a timeline of ~40 rows. A `panel` with the lede on the left and a bullet rail on the right above 1050px, separated by a hairline (top border when stacked). Bullets are 6px Signal Blue dots with Body text. It is a plain `panel`: the page's raised rank belongs to Today's Story's opening card.

### The Session Digest

The first thing on Market: one horizontal band stating how the session went across the tracked universe (breadth bar, advancers and decliners, significance count labelled Top-20-only). It uses `flex-wrap` with **no breakpoint of its own**, so it folds wherever its groups stop fitting. The breadth bar is a `well` holding two `lit-fill` segments that grow from the outer ends toward the split.

### Brand Marks

`CompanyLogo` puts a Brandfetch mark on `logo-plate` with `plate-object`, or a ticker lettermark on `surface-strong` with `plate-object-dark`. News thumbnails use the same chain, and use the Finnhub mark for market news. **A mark above the fold loads eagerly** (the Stocks header); list thumbnails load lazily.

### Signature Component: the Night Sky

A fixed layer at `z-index: -1` inside the root stacking context, sized `100vh`/`100lvh` (**never** `inset: 0` or `dvh`: iOS resizes those mid-scroll and the `slice`-scaled sky visibly zooms and re-rasterises). It is promoted with `translateZ(0)` so it is cached, not moved. It is built as a stack of layers:

| layer | contents | motion |
|---|---|---|
| far | 700 sub-pixel far points in uneven drifts, plus the dust tier (every second authored point, at 40% radius) | sways 4px / 1.5px |
| mid | the dim tier (every second authored point, at 34% radius) | sways 9px / 3px |
| near | 18 bright stars as HTML spans on a `sky-slice` box, five of them (`star-lit`) drawn 1.7× wherever the planet is shown | sways 18px / 6px and breathes |

There are no clouds and no `feTurbulence` filters in the sky any more. All depths share one 40s `ease-in-out alternate` period and differ only in distance, so the eye reads one slow camera drifting past a field. The sway stops on a phone, under reduced motion, and while an overlay is open; an iPad sways and its bright stars breathe (still to be watched on an A14 iPad). On a route change the depths also swing with the camera (see Saturn below) and settle back exactly where they were.

**`sky-interaction.tsx`** draws on its own canvas at the sky's depth, never into the SVG. On a fine pointer, stars within 110px of the cursor brighten and settle. Clicking bare sky on one of seven anchor stars draws up to three thin lines to neighbours, holds them, and fades them. Neither effect starts inside any panel or text rectangle, and no line crosses one. The cursor never changes over a star, so it cannot read as a control. The canvas runs a frame loop only while something is fading.

**`meteors.tsx`**: two meteors cross when a new day's data arrives (a route or date change fires `DATA_ARRIVED`). They restart by remounting on a new key, not by toggling a class.

Composition invariants: **bright stars are excluded from every panel rectangle, with margin, on every route**. A bright point under text is a hot spot, and the Worst-Case Composite Rule does not model point sources.

### Signature Component: Saturn

The one object in the sky (`saturn-scene.tsx`, `saturn-stage.tsx`, `saturn-webgl.ts`). Fixed at the sky's depth, after the sky and the pointer canvas, before the meteors, behind every pane, sized like the sky and clipped so its crop is never scrollable width. Decoration only: no figure, no label, no input, hidden from the accessibility tree.

- **The render.** A WebGL globe and ring system (banded, storms, rings with Kepler-rate clumps and spokes, the rings' shadow on the body), turning slowly, drawn at no more than 30 frames a second into a buffer capped per tier. It fades in on its first frame; until then there is no planet. Where it cannot run (no WebGL, a lost context, a device that cannot hold the frame rate), `data-three="off"` shows the drawn SVG fallback, held at `--saturn-glass` throughout because it cannot know where text is.
- **The views.** Each route has its own view per device class (`data-view` market / stocks / news), set as `--saturn-x`, `--saturn-y`, `--saturn-scale`, `--saturn-tilt`, `--saturn-roll`. Market: full size behind the digest and cards, cut by the right edge. Stocks: the body cut by the right edge behind the last column. News: the whole planet right of the title. See The Planet's Room Rule.
- **The camera.** A route change is the camera travelling to the next view (`--camera-duration` 1s on an even `--camera-ease`), the star depths swinging with it by a share of the move and settling back. It lands with the last card.
- **The shade.** The render is told where every pane and every read element is, and is dimmed under them (see The Shade-Under-Reading Rule). The shade mask is painted at a quarter of the viewport's resolution with Gaussian feathers, half a screen beyond each edge. A scroll moves it in the shader and repaints it only after half a screen, because repainting it on every scroll frame dropped frames on an M4 MacBook Air while drawing the planet every frame did not.
- **Phones have no planet.** Under 700px wide or 500px tall the scene is removed and the render never downloads.

### Motion

Arrival is **card by card, in reading order**, one beat (`--enter-step`, 110ms) apart:

1. **The page's line** (`data-enter="0"`): Market's date and digest, the Stocks header, the News title and filters. It starts at 0.45 opacity so the screen is never empty. Inside it the heading rises through a clip (`line-rise`, 900ms), the lede follows word by word from 240ms (`WordReveal`), and the one leading figure lands from 300ms (`figure-rise`): Market's advancing and declining counts and News's article count count up from zero (`CountUp`); the Stocks price and change rise without counting, because a price ticking up is what a live quote looks like.
2. **The first cards** (`data-enter` 1–3) after `--enter-lead` (340ms), rising 18px from clear over 560ms on an even deceleration, each catching light on its rim once as it settles.
3. **Everything else** fades in together on beat 4 without travelling.

What arrives below the fold is already at rest, instruments drawn: an entrance nobody sees still cost Safari a dropped frame as it started and another as it ended (`settleBelowFold` in `page-entrance.tsx`).

Instruments draw once their own card has settled (`--enter-instruments`, 280ms after the card): sparklines and the intraday line left to right, volume bars, the breadth bar toward its split, the story charts. A phone gets shorter, closer, quicker values for all of it.

A route change shows the skeleton immediately, and the page takes the skeleton's place mid-entrance rather than starting again (`page-entrance.tsx`). **A change within a page** (another stock, tab or filter) is not an arrival: the content steps back to 40% after 120ms while waiting, then comes up from 40% in 220ms, with no card waiting its turn and no chart redrawing. **Another date is an arrival**: the content steps back the same way while waiting, then the whole entrance plays, cards and charts included.

Interaction motion is short and physical: `lift` over 220ms on `cubic-bezier(0.16, 1, 0.3, 1)`, `press` over 150ms, colour transitions at 150ms. An overlay settles out of the button that opened it in 200ms.

`prefers-reduced-motion` is honoured with **an alternative, not a kill**: ambient motion (sway, breathing, meteors, pointer glow, constellations) stops, the page is simply there with every chart drawn, the planet is drawn still, and the overlay still fades in over 160ms.

**The Cropped-Frame Rule.** The sky is drawn `xMidYMid slice`, so the viewBox is **cropped, never fitted**. A narrow viewport sees only the middle band. **Compose against the crop, not the viewBox.** Anything authored near the frame edge is authored where most viewports will not see it whole.

### Named Rules

**The Room-Moves, Data-Holds Rule.** Nothing that carries information may move after it has arrived: no price, change, badge, rank, bar or line animates on a timer, pulses, or ticks. The room (sky, stars, meteors, the planet and the camera between its views) may move, because it carries nothing. A line drawing itself once says "here is the session"; the same line redrawing would say "the session is still running", which is the lie this design exists to prevent.

**The Room-Then-Instruments Rule.** Structure arrives first, then the things drawn inside it, offset by `--enter-instruments`. When arrival is too loud, **sequence before you shorten and shorten before you delete**.

**The Bounded Motion Rule.** Motion is affordable where it cannot invalidate expensive work. The sky may sway because panes are plain alpha now: each depth moves as a transform on its own layer, and a trace shows zero Paint and Raster events while scrolling. The planet may turn because it is one capped draw at no more than 30 frames a second, and a scroll moves its shade rather than repainting it. Anything that would re-run a blur every frame is still forbidden. That is why sway pauses under an open overlay. **If blur ever returns to a scrolling pane, the sway must go first.**

**The Resting-State-Is-Correct Rule.** Every animation's resting state is the finished state: masks rest opaque, `stroke-dashoffset` rests at 0, keyframes fill `backwards` rather than `both`. If the animation never runs, the page is simply the page.

## Do's and Don'ts

### Do:

- **Do** measure every colour pair at the worst-case composite (`canvas`), and re-take the sky's peak after any change to the sky.
- **Do** re-measure text contrast over the rendered planet after changing any `--saturn-*` colour or share.
- **Do** compose each route's view of the planet against that route's measured panes, figures and charts at scroll 0, per device class.
- **Do** give a new pane the glass weight of what it holds: `panel` for figures and charts, `panel pane-quiet` for writing and lists.
- **Do** build every container from a material utility, and add a variant to the utility instead of inlining a recipe.
- **Do** pick a plate's material from what is *behind* it: glass on the field, a baked token inside a panel.
- **Do** use `primary-active` for accent text on an accent or raised plate.
- **Do** set data in JetBrains Mono with `tabular-nums`, and written prose in Source Serif 4.
- **Do** use `well` for a track, `lit-fill` for the amount along it, and `plate-object` for a tile resting on glass.
- **Do** keep each card grid identical to its `loading.tsx` skeleton.
- **Do** give anything with a hard minimum width its own `overflow-x-auto` island, plus a sentence saying it scrolls.
- **Do** derive breakpoints from the shell arithmetic and record the arithmetic at the call site.
- **Do** give a wide panel a second column rather than a narrower measure.
- **Do** compose the sky against the *cropped* frame, and keep bright stars and pointer effects out of every content rectangle.
- **Do** check a grid at every column count it passes through, at the device's real width (iPad 10th gen is 820 and 1180).
- **Do** state a busy state in words. Dimming can only say "no".
- **Do** declare keyboard shortcuts in `aria-keyshortcuts` on the control they operate.
- **Do** give every control a 44px target on `pointer-coarse` and leave it alone on a mouse. The one exception is the wrapping row of sector pills, whose targets reach 32px into their shared gaps.
- **Do** theme the browser surfaces: selection, scrollbars, focus rings, and `cursor: pointer` on `<button>` and `<summary>` (Tailwind v4 preflight dropped it).

### Don't:

- **Don't** add a second theme. There is no honest daylight counterpart to a starfield.
- **Don't** put `backdrop-filter` back on any pane that scrolls. Only the overlay frosts.
- **Don't** write a tinted plate as an alpha (`bg-primary/8`).
- **Don't** put a coloured glow around a panel. A pane does not emit.
- **Don't** animate, loop, pulse or auto-refresh anything that carries data. The session being described is over.
- **Don't** draw pointer effects into the sky's SVG, or animate anything inside it. Either throws away the cached texture.
- **Don't** put the planet behind a figure, a sparkline or a chart, and don't brighten the shade to make one legible: move the view instead.
- **Don't** give the planet's warm palette to anything that is not the planet.
- **Don't** repaint the planet's shade mask on every scroll frame. A scroll moves the painted mask; it is repainted only after half a screen.
- **Don't** show a planet on a phone.
- **Don't** start every animation at t=0. The page's line arrives, then the cards one beat apart, then the instruments in each card.
- **Don't** replay the arrival for a change within a page (a stock, a tab, a filter). It is one short fade. A new date is an arrival.
- **Don't** declare an ARIA role you have not built the keyboard model for.
- **Don't** set a keyboard hint as bare quiet text beside a label. Draw a keycap or leave it out.
- **Don't** let Signal Blue become decorative. Outside a token of state, an accent dot, tick or rule is a violation.
- **Don't** colour an action in a hue that already means something else on the screen. Use a glyph or a word.
- **Don't** replace a quiet answer with a dash or a blank.
- **Don't** state the same fact in the shell and on a page. One of the two will drift.
- **Don't** fill a display slot because the page has one.
- **Don't** split a heading into per-character boxes.
- **Don't** author the sky anywhere but `night-sky.tsx`, or the planet anywhere but the Saturn files and its `--saturn-*` tokens.
- **Don't** span an orphaned card across the remainder of its row.
- **Don't** size the sky with `inset: 0` or `dvh`.
- **Don't** add an eyebrow, a section number, a gradient text fill, or a hard offset shadow.
