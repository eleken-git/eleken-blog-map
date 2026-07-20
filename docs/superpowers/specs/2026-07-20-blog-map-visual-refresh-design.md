# Blog Map Visual Refresh — Design

**Date:** 2026-07-20
**Scope decision:** "Just a visual refresh" — keep the year-cluster concept, the dark theme, and the two-file architecture. Approach A ("surgical polish") approved, plus the optional 2020 color fix.
**User priorities:** first impression, label readability, interaction feel. (Colors explicitly *not* a priority beyond the single approved nudge.)

## Context

The app renders 517 blog articles as an Obsidian-style dot field (D3 v7 force layout), clustered by publish year, with a sidebar tree, search, zoom/pan, hover labels, and click-to-focus. Data (`nodes.js`) is generated at build time from Webflow CMS; `eleken-blog-map.js` contains the inlined D3 bundle plus ~460 lines of map logic. There is no test infrastructure; the app is a static page served as-is.

Problems this refresh fixes:

1. **First impression.** The page paints at zoom 1 with clusters cut off, dots still moving, then jumps to the fitted overview 700 ms later (`setTimeout(()=>fitAll(650,…),700)`). Per-dot jitter uses unseeded `Math.random()`, so the layout differs on every reload.
2. **Label readability.** No labels until zoom k < 0.28 is crossed; labels toggle via `display:none` (pop, no fade); selection is purely by distance from screen center, so one cluster can take every label slot.
3. **Interaction feel.** Hover radius jumps 5→9 px with no easing; other-cluster fading snaps; the focus pulse is plain; sidebar and map highlight only sync on click, not hover.
4. **(Approved extra)** 2020 `#7c83ff` vs 2021 `#36b3ff` fails the normal-vision separation floor (ΔE 12.9 < 15, OKLab×100) — the only real legibility failure in the palette.

## Non-goals

- No layout-concept change (clusters stay year-based and organically placed).
- No new data fields, no edges/links, no light theme, no framework/build changes.
- No palette redesign beyond the single 2020 nudge.
- Mobile layout unchanged (existing media query stays).

## Design

### 1. Opening sequence

- **Deterministic layout:** replace `Math.random()` jitter in the `posts` construction with the existing seeded LCG pattern (same generator as `hubPos`, different fixed seed). Same map every visit.
- **Pre-settled first paint:** after constructing the simulation, run `sim.tick()` synchronously in a loop (~150 ticks, tuned so total cost stays under ~250 ms for 517 nodes), then let the normal low-alpha simulation continue. Dots are born in their final arrangement.
- **Instant framing:** compute the fit-all transform at startup and apply it with zero duration before first paint — at 94% of the fitted scale, which still frames all clusters (fit already includes a 0.82 margin factor). Remove the 700 ms delay + jump. `ready=true` (label placement enabled) from the first frame.
- **Arrival ease (subtle, once):** dots/labels fade in ~250 ms while the zoom eases from that 94% to the exact fit over ~600 ms (cubic in-out). No other load animation.
- Resize refit (ResizeObserver) behavior unchanged.

### 2. Label system

- **Zoom-scaled budget:** replace the hard `k<0.28 → none` gate with a budget function of zoom k: ~12 labels at the fitted overview (k≈0.48 on a 1280×720 viewport), growing monotonically to the existing cap of 56 by k≈2, and 0 only below k≈0.12. Exact curve tuned during verification.
- **Cluster round-robin selection:** rank candidates within each year by distance to viewport center (as today), then interleave years (1st of each year, then 2nd of each, …) so every visible cluster gets labels before any cluster gets its 4th. Ties inside a year break toward newer `iso` dates.
- **Fades, not pops:** labels use `opacity` with a ~150 ms CSS transition; `display:none` remains only for filtered-out nodes. Positions update instantly during pan/zoom (no positional tweening — it smears).
- **Type tuning:** `.lbl` font 12 → 12.5 px, halo `stroke-width` 4 → 4.5 px.
- Collision avoidance (`pickLabelSpot`), truncation, hover label, and the 56 cap stay as they are.

### 3. Interaction feel

- **Hover:** dot radius transitions 5 → 9 px over ~140 ms (cubic-out) via d3 transition; hovered dot gets a soft glow in its own year color (SVG `feDropShadow` filter applied only to the hovered/focused node — one element, cheap). The existing same-year-emphasis / other-year-fade behavior stays but colors/opacity transition ~150 ms instead of snapping.
- **Focus:** the click pulse becomes an expanding, fading ring (one SVG circle animated r + opacity, accent color); zoom-to-dot easing cubic in-out, ~850 ms.
- **Sidebar ↔ map hover sync:** hovering a dot adds a highlight class to its sidebar row (no auto-scroll); hovering a sidebar row emphasizes its dot on the map (reusing `emphasize()`, without the cursor tooltip). Both clear symmetrically. Click behavior unchanged.
- **Tooltip:** the date badge background uses the node's year color instead of the generic accent. Everything else stays.

### 4. Palette nudge (approved)

- `COLORS[2020]: #7c83ff → #6b5bff` (deeper indigo, same periwinkle character).
- Validated with the dataviz palette script (dark surface): vs 2021 `#36b3ff` ΔE 21.3 normal / 16.4 worst-CVD; vs 2025 `#c879ff` ΔE 17.2 normal / 9.3 worst-CVD (above the 6–8 floor band, and identity is additionally encoded by position + year labels).
- Sidebar `.fdot`, year labels, and tooltip badge inherit automatically since they read `COLORS`.
- **Known & accepted:** 2023 `#f2b53b` vs 2024 `#ff7a59` sits at ΔE 14.8, a hair under the 15 floor. Pre-existing, unrelated to this change, strongly disambiguated by giant year labels and spatial separation. Out of scope.

## Error handling

The app has no network or async failure surface at runtime (static data, no fetches). The only new failure mode is the synchronous pre-settle loop taking too long on slow hardware; guard: cap the loop by *both* tick count and elapsed time (`performance.now()` budget ~250 ms) — if the budget is hit, remaining settling happens live as today.

## Verification (manual, via browser preview)

1. Reload twice → pixel-identical cluster arrangement (determinism).
2. First visible frame → all 8 clusters framed, no cut-offs, dots not visibly drifting.
3. Overview shows ~12 labels spread across clusters (not all in one); zooming in grows label count smoothly; labels fade rather than pop.
4. Hover a dot → eased growth + year-color glow; other clusters fade smoothly; sidebar row highlights. Hover a sidebar row → dot emphasizes.
5. Click a dot → ring pulse + smooth zoom; Esc/↺ resets.
6. 2020 vs 2021 clusters clearly distinguishable; tooltip badge shows year color.
7. Console clean; pre-settle time logged < 250 ms; pan/zoom stays at 60 fps feel with all labels enabled.

## Files touched

- `eleken-blog-map.js` — logic changes (all sections).
- `eleken-blog-map.css` — label transition/typography, sidebar hover-highlight class, tooltip badge no longer hardcodes accent.
- Nothing else. `nodes.js`, `index.html`, build scripts, and deployment untouched.
