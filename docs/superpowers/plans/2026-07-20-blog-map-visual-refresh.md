# Blog Map Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the blog map's opening sequence, label system, and interaction feel per the approved spec (`docs/superpowers/specs/2026-07-20-blog-map-visual-refresh-design.md`), plus one validated color fix.

**Architecture:** All logic changes go into the map-logic section of `eleken-blog-map.js` (a single classic script containing the inlined D3 v7 bundle on lines 1–3 and ~460 lines of app code after it); style changes go into `eleken-blog-map.css`. No modules, no build step, no new files at runtime.

**Tech Stack:** Vanilla JS + D3 v7 (inlined), plain CSS. Verification is in-browser (no test framework exists; the repo is a static page). Top-level `const`/`function` declarations in the classic script are reachable from the browser console, so verification steps run real assertions against the live page via console/javascript evaluation.

## Global Constraints

- Do not touch: `nodes.js`, `index.html`, `scripts/`, `vercel.json`, the D3 bundle (lines 1–3 of `eleken-blog-map.js`).
- Keep the two-file architecture: only `eleken-blog-map.js` and `eleken-blog-map.css` change.
- Palette: only `COLORS[2020]` changes, to exactly `#6b5bff` (Task 5). All other hex values stay.
- Pre-settle loop must be capped by BOTH ~150 ticks AND a 250 ms `performance.now()` budget.
- Verification server: `.claude/launch.json` config name `static` → `http://localhost:8765`. **Do not overwrite `.claude/launch.json`** (it has two configs: `static`, `static-public`).
- After each task: reload the page, check the browser console for errors (must be clean), then commit.

**How to run the in-browser assertions:** each RED/GREEN step below gives a JS expression. Evaluate it in the page context (browser devtools console or the preview's javascript tool) after a full reload. Expected values are exact unless a range is given.

---

### Task 1: Deterministic, pre-settled, instantly-framed opening

> **Executed with deviations (2026-07-20):** (1) pre-settle runs to alpha ≤ 0.01 (caps: 300 ticks / 700 ms) instead of 150 ticks / 250 ms — the layout overshoots then contracts, and 150 ticks froze it mid-overshoot with a wrong frame; when the threshold is reached the sim timer is not restarted (static, fully deterministic map). (2) `fitTransform` measures `nodeG` (dots only), not `root` — year glyphs inflated the box asymmetrically. (3) Added hidden-tab branch + `autoFrame` resize re-framing: `schedule`/state `let` moved above `ticked()` (TDZ), zoom handler sets `autoFrame=false` on user gestures, `focusNode`/`focusYear` clear it, `resetView` re-arms it, ResizeObserver re-fits while auto-framed and ignores zero sizes. The code blocks below were updated to the as-built versions.

**Files:**
- Modify: `eleken-blog-map.js` (rng helper ~line 53, `posts` jitter ~line 87, simulation block ~lines 131–149, `fitAll` ~line 281, startup line 499)

**Interfaces:**
- Produces: `makeRng(seed) -> () => number` (module-level), `fitTransform(scale=1) -> d3.zoomTransform|null`, `window.__presettleMs: number`, named tick handler `ticked()`. `fitAll(duration, onEnd)` keeps its existing signature (Task 5's verification and existing callers `resetView` rely on it).

- [ ] **Step 1: RED — capture current broken behavior**

Reload the page twice. After each load evaluate:

```js
posts.slice(0, 20).map(p => Math.round(p.x) + "," + Math.round(p.y)).join(";")
```

Expected: the two strings DIFFER (unseeded `Math.random()` jitter). Also `typeof fitTransform` → `"undefined"`, `window.__presettleMs` → `undefined`. Screenshot immediately after load shows clusters cut off at zoom 1 for ~0.7 s before the fit animation.

- [ ] **Step 2: Extract the seeded RNG into a reusable helper**

At ~line 53, above the organic-cluster IIFE, add:

```js
const makeRng = s => { let x = s >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; };
```

Inside the IIFE (line 55), replace the inline generator with the helper:

```js
  const rng = makeRng(20241015);
```

(Keep seed `20241015` — cluster positions must not move.)

- [ ] **Step 3: Seed the per-dot jitter**

Replace the `posts` construction (lines 87–88):

```js
const jitterRng = makeRng(20260720);
const posts = NODES.map((n,i)=>({id:"p"+i, ...n, _lab:trunc(n.name),
  x:hubPos[n.year].x+(jitterRng()-.5)*180, y:hubPos[n.year].y+(jitterRng()-.5)*180}));
```

- [ ] **Step 4: Name the tick handler and pre-settle the simulation**

Replace the simulation block (lines 131–149) with:

```js
function ticked(){
  node.attr("cx",d=>d.x).attr("cy",d=>d.y);
  // track year label to actual centroid of its cluster dots
  years.forEach(y=>{
    if(!yrText[y]) return;
    const cs=posts.filter(p=>p.year===y);
    if(!cs.length) return;
    const cx=cs.reduce((s,p)=>s+p.x,0)/cs.length;
    const cy=cs.reduce((s,p)=>s+p.y,0)/cs.length;
    yrText[y].setAttribute("x",cx);
    yrText[y].setAttribute("y",cy);
  });
  schedule();
}
const sim = d3.forceSimulation(posts)
  .force("charge", d3.forceManyBody().strength(-110))
  .force("collide", d3.forceCollide().radius(18).iterations(3))
  .force("x", d3.forceX(d=>hubPos[d.year].x).strength(.12))
  .force("y", d3.forceY(d=>hubPos[d.year].y).strength(.12))
  .on("tick", ticked);

// pre-settle synchronously past the expansion overshoot so the first painted
// frame is the near-equilibrium layout; no timer restart unless the budget hits
sim.stop();
{
  const t0 = performance.now();
  let i = 0;
  for (; i < 300 && sim.alpha() > 0.01 && performance.now() - t0 < 700; i++) sim.tick();
  window.__presettleMs = Math.round(performance.now() - t0);
  window.__presettleTicks = i;
  if (sim.alpha() > 0.01) sim.restart();
}
ticked();
```

Also: the `let ready=false, hovered=null, focused=null, activeItemEl=null, rafQ=false, autoFrame=true;` line and `function schedule(){…}` must sit ABOVE `function ticked()` — the synchronous `ticked()` call reads `rafQ` via `schedule()`, and in their original position (after the sim block) that hits the `let` temporal dead zone and kills the script.

Note: `sim.tick()` does not dispatch tick events — that is why `ticked()` is called once after the loop. Reaching alpha ≤ 0.01 means equilibrium: the timer stays stopped (static, deterministic map; hover/drag `restart()` it on demand). d3-force's internal jiggle RNG is deterministically seeded, so the settled layout is reproducible.

- [ ] **Step 5: Extract `fitTransform` and reuse it in `fitAll`**

Replace `fitAll` (lines 281–288) with:

```js
function fitTransform(scale=1){
  // frame the dots; the giant year glyphs are decoration and may bleed past the frame
  const b=nodeG.node().getBBox(), availW=Math.max(240,W-SB);
  if(!b.width||!b.height) return null;
  const k=Math.min(availW/b.width,H/b.height)*0.82*scale;
  return d3.zoomIdentity.translate(SB+availW/2-k*(b.x+b.width/2), H/2-k*(b.y+b.height/2)).scale(k);
}
function fitAll(duration=700,onEnd){
  const t=fitTransform();
  if(!t) return;
  const tr=svg.transition().duration(duration).ease(d3.easeCubicInOut).call(zoom.transform,t);
  if(onEnd) tr.on("end",onEnd);
}
```

- [ ] **Step 6: Replace the delayed fit with the instant-framed opening**

Replace line 499 (`setTimeout(()=>fitAll(650,()=>{ ready=true; place(); }),700);`) with:

```js
// ---- opening: first paint is the framed, settled overview ----
if(document.hidden){
  // background-tab load: no animations (rAF is stalled); the ResizeObserver
  // re-frames with real dimensions once the tab becomes visible
  const _tFit=fitTransform();
  if(_tFit) svg.call(zoom.transform,_tFit);
  ready=true; place();
}else{
  svg.style("opacity",0);
  const _t94=fitTransform(0.94);
  if(_t94) svg.call(zoom.transform,_t94);
  ready=true; place();
  svg.transition().duration(250).style("opacity",1);
  const _tFit=fitTransform();
  if(_tFit) svg.transition("arrive").duration(600).ease(d3.easeCubicInOut).call(zoom.transform,_tFit);
}
```

(The whole script executes before the browser's first paint, so frame 1 is already the 94%-framed overview fading in; the named `"arrive"` transition eases to the exact fit without fighting the opacity transition.)

Auto-framing support (three small edits): the zoom handler gains `if(e.sourceEvent) autoFrame=false;` as its first line; `focusNode` and `focusYear` set `autoFrame=false;`; `resetView` sets `autoFrame=true;` before its `fitAll(...)`. The ResizeObserver callback becomes:

```js
new ResizeObserver(()=>{
  const nW=_wrap.clientWidth, nH=_wrap.clientHeight;
  if(!nW||!nH) return;
  if(Math.abs(nW-W)>10||Math.abs(nH-H)>10){
    W=nW;
    H=nH;
    svg.attr("viewBox",[0,0,nW,nH]);
    if(autoFrame){ svg.interrupt("arrive"); const t=fitTransform(); if(t) svg.call(zoom.transform,t); }
    schedule();
  }
}).observe(_wrap);
```

- [ ] **Step 7: GREEN — verify determinism, framing, budget**

Reload twice; evaluate after each load:

```js
posts.slice(0, 20).map(p => Math.round(p.x) + "," + Math.round(p.y)).join(";")
```

Expected: IDENTICAL strings across reloads. Then:

```js
[window.__presettleMs, window.__presettleTicks, +sim.alpha().toFixed(3)]
```

Expected: `[<number < 700>, <≈200>, 0.01]`. Screenshot immediately after reload: all 8 clusters visible and framed (no cut-offs, no zoom jump afterward). Console: no errors.

- [ ] **Step 8: Commit**

```bash
git add eleken-blog-map.js
git commit -m "feat: deterministic seeded layout with pre-settled, instantly framed opening"
```

---

### Task 2: Zoom-scaled label budget with cluster round-robin and fades

**Files:**
- Modify: `eleken-blog-map.js` (`label` creation ~lines 124–128, `place()` selection ~lines 195–216)
- Modify: `eleken-blog-map.css` (`.lbl` rule ~line 84)

> **Executed with a deviation (2026-07-20):** the budget anchors are ratios of the fitted-overview scale (`k/kFit`), not absolute k — absolute anchors gave 2 labels at overview in a narrow viewport where the fit lands at k≈0.18. `kFit` is a `let` cached by `fitTransform(scale)` whenever `scale===1`. Anchors: `[[0.25,0],[1,12],[2.1,30],[4.2,56]]`. The code below is as-built.

**Interfaces:**
- Consumes: `matches(d)`, `labelWidth(d)`, `pickLabelSpot(p,w,placed)`, `labelBox`, `hoverBox` — all unchanged.
- Produces: `labelBudget(k) -> integer` (module-level; reads the `kFit` cache). Labels toggle CSS class `on` instead of `display`.

- [ ] **Step 1: RED**

```js
[typeof labelBudget, document.querySelectorAll("text.lbl.on").length]
```

Expected: `["undefined", 0]` (no budget function, no `on` class yet — labels still toggle via `display`). Baseline for comparison, at the fresh-load overview:

```js
new Set(d3.selectAll("text.lbl").filter(function(){return this.style.display!=="none";}).data().map(d=>d.year)).size
```

Expected: a small number (often 1–3) — current selection is purely center-distance, so labels pile into whichever clusters sit nearest the screen center instead of spreading across years.

- [ ] **Step 2: Add the budget function and switch selection to round-robin**

At ~line 128, replace `const MAX_VISIBLE_LABELS = 56;` with:

```js
const MAX_VISIBLE_LABELS = 56;
function labelBudget(k){
  // anchored to the fitted overview scale so any viewport shows ~12 labels at overview
  const r=k/kFit;
  const pts=[[0.25,0],[1,12],[2.1,30],[4.2,MAX_VISIBLE_LABELS]];
  if(r<pts[0][0]) return 0;
  for(let i=1;i<pts.length;i++){
    const [x0,y0]=pts[i-1],[x1,y1]=pts[i];
    if(r<=x1) return Math.round(y0+(y1-y0)*(r-x0)/(x1-x0));
  }
  return MAX_VISIBLE_LABELS;
}
```

Supporting cache: add `kFit=0.4` to the state `let` line, and inside `fitTransform` after computing `k` add `if(scale===1) kFit=k;  // cache the overview scale for the label budget`.

In `place()`, replace everything from `if(!ready){…}` (line 195) through the final `label…display` assignment (line 216) with:

```js
  if(!ready){ label.classed("on",false); return; }
  const budget=labelBudget(k);
  if(!budget){ label.classed("on",false); return; }

  const cx=SB+(W-SB)/2, cy=H/2;
  const byYear=new Map();
  posts.forEach(d=>{
    if(!matches(d)||d===prominent) return;
    const p=t.apply([d.x,d.y]);
    if(p[0]<SB-120||p[0]>W+120||p[1]<-80||p[1]>H+80) return;
    let arr=byYear.get(d.year); if(!arr) byYear.set(d.year,arr=[]);
    arr.push({d,p,dist:Math.hypot(p[0]-cx,p[1]-cy)});
  });
  byYear.forEach(list=>list.sort((a,b)=>a.dist-b.dist||(b.d.iso||"").localeCompare(a.d.iso||"")));
  // round-robin: every visible cluster gets its 1st label before any cluster gets its 2nd
  const queues=[...byYear.values()], candidates=[];
  for(let r=0;queues.some(q=>r<q.length);r++)
    for(const q of queues) if(r<q.length) candidates.push(q[r]);

  const selected=new Map(), placed=hoverBox?[hoverBox]:[];
  for(const c of candidates){
    if(selected.size>=budget) break;
    const w=labelWidth(c.d), spot=pickLabelSpot(c.p,w,placed);
    if(!spot) continue;
    selected.set(c.d,{x:spot.x,y:spot.y});
    placed.push(spot.box);
  }

  label.each(function(d){
    const s=selected.get(d);
    if(s){ this.setAttribute("x",s.x); this.setAttribute("y",s.y); }
  });
  label.classed("on",d=>selected.has(d));
```

- [ ] **Step 3: Drop the display toggle from label creation**

Replace the `label` creation (lines 124–126):

```js
const label = overlay.selectAll("text.lbl").data(posts).join("text")
  .attr("class","lbl").attr("text-anchor","middle").text(d=>d._lab);
```

- [ ] **Step 4: CSS — fade transition and type tuning**

In `eleken-blog-map.css`, replace the `.lbl` rule:

```css
.lbl{font-size:12.5px;font-weight:650;fill:#d9dee7;pointer-events:none;paint-order:stroke;
  stroke:#353535;stroke-width:4.5px;stroke-linejoin:round;
  opacity:0;transition:opacity .15s ease}
.lbl.on{opacity:1}
```

- [ ] **Step 5: GREEN**

Reload. Evaluate:

```js
[labelBudget(kFit*0.2), labelBudget(kFit), labelBudget(kFit*2.1), labelBudget(kFit*4.2), labelBudget(kFit*9)]
```

Expected: `[0, 12, 30, 56, 56]`. After the 600 ms arrival ease finishes:

```js
document.querySelectorAll("text.lbl.on").length
```

Expected: 8–12 (budget 12 minus any collision rejections). Cluster spread:

```js
new Set(d3.selectAll("text.lbl.on").data().map(d=>d.year)).size
```

Expected: ≥ 4 distinct years. Zoom in with the wheel: label count grows; labels fade in/out (no popping). Console clean.

- [ ] **Step 6: Commit**

```bash
git add eleken-blog-map.js eleken-blog-map.css
git commit -m "feat: zoom-scaled label budget, cluster round-robin selection, opacity fades"
```

---

### Task 3: Hover feel — eased dots, year-color glow, row highlight, year-color tooltip badge

**Files:**
- Modify: `eleken-blog-map.js` (defs after `svg` creation ~line 100, helper near `escapeHtml` ~line 11, `emphasize` ~line 220, `applyFilter` ~line 429, `clearFocusedPost` ~line 256, `applyFocusedNode` ~line 239, node `mouseenter` ~line 266)
- Modify: `eleken-blog-map.css` (`.node` rule ~line 81, new `.item.hovered` rule near `.item:hover` ~line 40)

**Interfaces:**
- Consumes: `COLORS`, `emphasize(d)`/`resetEmph(d)` (existing sidebar-row hover already calls them — reused untouched from the caller side).
- Produces: `setRowHover(el|null)`, `darkText(hex) -> boolean`, SVG filters with ids `glow-<year>` (e.g. `glow-2021`, `glow-0`).

- [ ] **Step 1: RED**

```js
[typeof setRowHover, typeof darkText, document.querySelector("filter#glow-2021")]
```

Expected: `["undefined","undefined",null]`. Hovering a dot: radius jumps instantly (no easing), sidebar row does not highlight, tooltip badge is always the same accent color.

- [ ] **Step 2: CSS — ease radius/fill/opacity changes on dots; sidebar hover class**

In `eleken-blog-map.css`, replace `.node{cursor:pointer}` with:

```css
.node{cursor:pointer;transition:r .14s cubic-bezier(.22,.61,.36,1),fill .15s ease,opacity .15s ease}
```

(All existing `.attr("r"/"fill"/"opacity", …)` calls now animate via CSS — no JS transition plumbing. `cx`/`cy` are deliberately NOT in the transition list so simulation/drag movement stays instant.)

Next to the `.item:hover` rule add:

```css
.item.hovered{background:var(--panel2);color:var(--text)}
```

- [ ] **Step 3: Per-year glow filters**

In `eleken-blog-map.js`, right after `const overlay = svg.append("g");` (line 101), add:

```js
const defs=svg.append("defs");
Object.entries(COLORS).forEach(([y,c])=>{
  defs.append("filter").attr("id","glow-"+y)
      .attr("x","-150%").attr("y","-150%").attr("width","400%").attr("height","400%")
    .append("feDropShadow")
      .attr("dx",0).attr("dy",0).attr("stdDeviation",6)
      .attr("flood-color",c).attr("flood-opacity",0.85);
});
```

- [ ] **Step 4: Wire glow + row highlight into the hover/focus/filter cycle**

Near `escapeHtml` (~line 11) add the helpers:

```js
const darkText=c=>{const n=parseInt(c.slice(1),16);return (0.2126*(n>>16)+0.7152*(n>>8&255)+0.0722*(n&255))/255>0.6;};
let hoveredItemEl=null;
function setRowHover(el){
  if(hoveredItemEl===el) return;
  hoveredItemEl?.classList.remove("hovered");
  hoveredItemEl=el||null;
  hoveredItemEl?.classList.add("hovered");
}
```

In `emphasize(d)` (line 220), after `hovered=d;` add `setRowHover(d._itemEl);`, and extend the node styling chain with a filter line:

```js
function emphasize(d){
  hovered=d;
  setRowHover(d._itemEl);
  d.fx=d.x; d.fy=d.y;  // pin so it doesn't drift while neighbours spread
  node.attr("r",n=>n===d?9:(n===focused?10:5))
      .attr("fill",n=> n===d ? "var(--accent)" : (n===focused ? "var(--accent)" : (n.year===d.year ? (COLORS[n.year]||"var(--dot)") : "var(--dot-fade)")))
      .attr("filter",n=>n===d||n===focused?`url(#glow-${n.year})`:null);
  hoverLabel.text(d.name).style("opacity",1); place();
}
```

In `resetEmph(d)` (line 227), after `hovered=null;` add `setRowHover(null);`.

In `applyFilter()` (line 429), extend the node chain to clear glows:

```js
  node.attr("r",5).attr("fill",d=>matches(d)?(COLORS[d.year]||"var(--dot)"):"var(--dot-fade)")
      .attr("opacity",d=>matches(d)?1:.08).attr("pointer-events",d=>matches(d)?"all":"none")
      .attr("filter",null);
```

In `applyFocusedNode()` (line 239), extend its node chain with:

```js
      .attr("filter",n=>n===focused?`url(#glow-${n.year})`:null)
```

In `clearFocusedPost()` (line 256), after `hovered=null;` add `setRowHover(null);`.

- [ ] **Step 5: Year-color tooltip badge**

In the node `mouseenter` handler (line 270), replace the tooltip line with:

```js
  const c=COLORS[d.year]||"#7f8fff";
  tipD.style.background=c; tipD.style.color=darkText(c)?"#1c1c1c":"#fff";
  tipT.textContent=d.name; tipD.textContent=d.date; tipS.textContent=d.slug; tip.style.opacity=1;
```

- [ ] **Step 6: GREEN**

Reload, then:

```js
[typeof setRowHover, typeof darkText, !!document.querySelector("filter#glow-2021"), darkText("#f2b53b"), darkText("#6b5bff")]
```

Expected: `["function","function",true,true,false]` (note: `darkText("#6b5bff")` tests the Task 5 color early — the function is pure so this passes regardless of Task 5). Hover a dot: it grows smoothly (~140 ms), glows in its year color, other clusters fade smoothly, and its sidebar row highlights (open that year's folder first to see the row). Un-hover: everything eases back, row highlight clears. Hover a 2023 (amber) dot: tooltip date badge is amber with dark text; a 2021 dot: blue with dark text; a 2025 dot: violet with white text. Console clean.

- [ ] **Step 7: Commit**

```bash
git add eleken-blog-map.js eleken-blog-map.css
git commit -m "feat: eased hover with year-color glow, dot-to-sidebar highlight, year-color tooltip badge"
```

---

### Task 4: Focus feel — tuned zoom easing and a cleaner pulse on every focus

**Files:**
- Modify: `eleken-blog-map.js` (`focusNode` ~line 278, `pulse` ~line 300, `pickPost` ~line 371)

**Interfaces:**
- Consumes: `pulse(d)` (existing), `applyFocusedNode()`.
- Produces: `focusNode` now pulses on transition end for BOTH dot clicks and sidebar clicks; `pickPost` no longer schedules its own pulse.

- [ ] **Step 1: RED**

Click a dot on the map: the zoom lands (700 ms) with NO pulse ring (today the pulse only fires from sidebar clicks). Click a sidebar row: a single thin ring appears via `setTimeout(...,720)` — slightly before the zoom actually ends.

- [ ] **Step 2: Retune focusNode and pulse**

Replace `focusNode` (lines 278–280):

```js
function focusNode(d){ const k=10,cx=SB+(W-SB)/2,cy=H/2;
  svg.transition().duration(850).ease(d3.easeCubicInOut)
     .call(zoom.transform, d3.zoomIdentity.translate(cx-k*d.x,cy-k*d.y).scale(k))
     .on("end",()=>{ if(focused===d){ applyFocusedNode(); pulse(d); } }); }
```

Replace `pulse` (lines 300–303):

```js
function pulse(d){ const t=d3.zoomTransform(svg.node()), p=t.apply([d.x,d.y]);
  [0,180].forEach(delay=>{
    overlay.append("circle").attr("cx",p[0]).attr("cy",p[1]).attr("r",7)
      .attr("fill","none").attr("stroke","var(--accent)").attr("stroke-width",2.5).attr("stroke-opacity",.9)
      .transition().delay(delay).duration(700).ease(d3.easeCubicOut)
      .attr("r",44).attr("stroke-opacity",0).attr("stroke-width",.5).remove();
  });
}
```

- [ ] **Step 3: Remove the sidebar's duplicate pulse**

In `pickPost` (lines 371–374), delete the `setTimeout(()=>pulse(p),720);` line:

```js
    function pickPost(){
      focusPost(p,{scrollMenu:false});
    }
```

- [ ] **Step 4: GREEN**

Reload. Click a dot on the map: smooth 850 ms cubic in-out zoom, then a double expanding ring fades out at the dot. Click a sidebar row: same single (not doubled-up) pulse after the zoom ends. Interrupt a focus zoom mid-flight by dragging: no stray pulse fires. Esc resets cleanly. Console clean.

- [ ] **Step 5: Commit**

```bash
git add eleken-blog-map.js
git commit -m "feat: pulse on every focus with tuned zoom easing; drop duplicate sidebar pulse"
```

---

### Task 5: 2020 color nudge + full verification sweep

> **Executed with an addition (2026-07-20):** the sweep's determinism check caught that `hubPos` world bounds were derived from the viewport at load (`W*2`, `H*2`), so different window sizes produced different maps. The cluster-position IIFE now uses fixed world constants (`px1=2400-100`, `py1=1600-100`), making the layout identical in every viewport (framing auto-fits). Verified: identical position hash across reloads in different pane states; `place()` averages ~0.5 ms.

**Files:**
- Modify: `eleken-blog-map.js` (COLORS, line 7)

**Interfaces:**
- Consumes: everything above. `COLORS[2020]` is read by dots, year labels, sidebar `.fdot`, glow filters, and the tooltip badge — all inherit the new value automatically.

- [ ] **Step 1: RED**

```js
COLORS[2020]
```

Expected: `"#7c83ff"`.

- [ ] **Step 2: Change the color**

Line 7, replace `2020:"#7c83ff",` with `2020:"#6b5bff",`. (Validated: vs 2021 `#36b3ff` ΔE 21.3 normal / 16.4 worst-CVD; vs 2025 `#c879ff` ΔE 17.2 normal — see spec §4.)

- [ ] **Step 3: GREEN + full spec verification sweep**

Reload and run the spec's checklist end-to-end:

1. `COLORS[2020]` → `"#6b5bff"`; the 2020 cluster, its sidebar dot, its year label, and its glow are all the deeper indigo, clearly distinct from 2021's blue.
2. Reload twice → `posts.slice(0,20).map(p=>Math.round(p.x)+","+Math.round(p.y)).join(";")` identical both times.
3. First frame after reload: all 8 clusters framed, settled, fading in; no jump.
4. `window.__presettleMs` < 250.
5. Overview shows 8–12 labels across ≥ 4 years; zoom in → more labels, fading not popping.
6. Hover dot → eased growth + year glow + row highlight; hover sidebar row → dot emphasizes. Both clear on leave.
7. Click dot → 850 ms zoom + double ring pulse; Esc/↺ resets; search filters live; year ◎ isolates a cluster.
8. Pan and zoom rapidly across the whole map: motion stays fluid (no visible stutter vs. before), console has zero errors/warnings.

- [ ] **Step 4: Commit**

```bash
git add eleken-blog-map.js
git commit -m "feat: shift 2020 cluster color to #6b5bff for legible separation from 2021"
```
