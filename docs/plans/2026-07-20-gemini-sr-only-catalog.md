# Gemini-Readable Article Catalog (sr-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bake a hidden, screen-reader-only catalog of all ~530 blog articles (title + article text + slug) into the map page at build time, so the browser's built-in AI assistants — Chrome's **Ask Gemini** side panel and the **Claude** browser extension, which read the page's rendered text snapshot — can answer questions about the whole blog. Zero visual change, zero runtime JavaScript, **zero API keys**.

**Architecture:** The map stays a fully static two-file page. The browser-built-in AI does ALL the AI work at question time — there is no LLM, no key, no proxy, no vector DB anywhere in this repo. The only job here is to place the article text (which already lives in Webflow) onto the page in hidden form. `scripts/build.mjs` — the build that already runs on every Vercel deploy — additionally fetches each article's body field and injects a hidden `<div class="sr-only">` catalog into `index.html`. Refresh happens through the **existing Webflow→Vercel deploy hook**: a writer publishes → Vercel rebuilds → the build re-fetches fresh text → the hidden block is re-baked. No new pipeline, no GitHub Action, no cache.

**Tech Stack:** Vanilla Node.js ESM (no dependencies — global `fetch`, `node:fs`), plain CSS. No test framework exists; verification is `node`-run assertions plus in-browser checks, matching the repo's established style.

## Why this shape (settled during grilling — do not relitigate, do not add to it)

- **The runtime AI is the browser's built-in assistant** (Ask Gemini / Claude extension), running in the visitor's browser. It is **free and needs no key**. This repo builds no assistant and calls no LLM. The RAG / vector-DB / serverless-proxy / build-time-LLM-summary paths were all considered and **rejected** — do not reintroduce any of them.
- **Those assistants read only the rendered text snapshot + a screenshot of the visible viewport.** They do NOT read `<script>` JSON, `application/ld+json`, network requests, or `display:none` content, and do NOT follow references to other JSON/URLs. Confirmed empirically against the live page. So the catalog must be **real rendered text in the DOM**.
- **`display:none` is dropped from the snapshot; the `sr-only` clip pattern is kept.** The catalog uses `sr-only` (invisible to sighted users, present in the accessibility tree / innerText). This is legitimate accessibility content — screen-reader users get the same index.
- **Newest-first ordering.** The snapshot has an unknown size cap; if it truncates it drops the tail, so the oldest articles are sacrificed, never the freshest.
- **Article text lives ONLY in the hidden HTML, never in `nodes.js`.** `nodes.js` is the data the map's D3 layer loads; keeping body text out of it keeps the map load light (the user's "must not lag" requirement).

## Global Constraints

- **Do not touch at runtime:** the inlined D3 bundle (lines 1–3 of `eleken-blog-map.js`), the map logic, or the `NODES` data shape. This feature adds **zero** runtime JavaScript.
- **No API keys, no LLM calls, no GitHub Action, no `summaries.json`.** The only credential involved is the `WEBFLOW_TOKEN` the build **already** uses (already set in Vercel). Nothing new to configure.
- **Keep the static two-file runtime.** The catalog is build-time-injected static HTML. The page must still work with no client-side API calls.
- **Catalog visibility:** use the `sr-only` clip pattern only. **Never** `display:none` / `visibility:hidden` — both are dropped from the AI's text snapshot.
- **Ordering: newest-first** (descending `iso`).
- **Body text goes into the hidden catalog HTML only** — never into `nodes.js`.
- **Per-article text length** is capped by one tunable constant (`CATALOG_CHARS`, default 500 — the article's lead, enough to convey what it covers) to honor the "must not lag" requirement and to fit more articles under the snapshot cap. One number to change if you want more/less.
- **Refresh:** via the existing Webflow→Vercel deploy hook. **Do not change that wiring.**
- **Prerequisite (Task 2 Step 1):** confirm the Webflow rich-text body field's API slug. The build reads it via `BODY_FIELD` (default `post-body`).
- **Collection id** is the existing `6368f41dd433865719aa82cd` (from `build.mjs`).
- After each task: run its verification, confirm no errors, then commit.

---

### Task 1: Pure catalog renderer (`scripts/catalog.mjs`)

A standalone, dependency-free module that turns article records into the hidden catalog HTML. Isolated so it is unit-testable with a fixture — **needs no Webflow token**.

**Files:**
- Create: `scripts/catalog.mjs`
- Test: `scripts/catalog.test.mjs`

**Interfaces:**
- Produces:
  - `escapeHtml(str) -> string` — escapes `& < > "` for safe HTML text.
  - `buildCatalog(articles) -> string` — returns one `<div class="sr-only" id="gemini-catalog">…</div>` string. `articles` is an array of `{slug, name, iso, text}` (extra fields ignored; `text` optional). Sorts by `iso` descending (newest first). Each renders `<article><h3>{name}</h3>[<p>{text}</p>]<p>{slug}</p></article>`; the text `<p>` is emitted only when a non-empty `text` exists.

- [ ] **Step 1: Write the failing test**

Create `scripts/catalog.test.mjs`:

```js
import assert from 'node:assert/strict';
import { buildCatalog, escapeHtml } from './catalog.mjs';

assert.equal(escapeHtml('a & b <c> "d"'), 'a &amp; b &lt;c&gt; &quot;d&quot;');

const articles = [
  { slug: 'old-post', name: 'Old Post', iso: '2020-01-01', text: 'Old body.' },
  { slug: 'new-post', name: 'New & Shiny <Post>', iso: '2026-06-01', text: 'Covers the shiny new thing.' },
  { slug: 'mid-post', name: 'Mid Post', iso: '2023-03-03' }, // no text
];
const html = buildCatalog(articles);

assert.match(html, /<div class="sr-only" id="gemini-catalog"/);
assert.match(html, /https:\/\/www\.eleken\.co\/blog-posts\//); // url-prefix hint line

// newest-first: new-post before mid-post before old-post
const iNew = html.indexOf('new-post'), iMid = html.indexOf('mid-post'), iOld = html.indexOf('old-post');
assert.ok(iNew < iMid && iMid < iOld, 'entries must be newest-first');

// escaping in titles
assert.match(html, /New &amp; Shiny &lt;Post&gt;/);

// text present only when supplied
assert.match(html, /<p>Covers the shiny new thing\.<\/p>/);
const midBlock = html.slice(html.indexOf('Mid Post'), html.indexOf('mid-post'));
assert.ok(!/<p>[^<]/.test(midBlock), 'mid-post has a title but no text paragraph before its slug');

console.log('catalog.test.mjs OK');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/catalog.test.mjs`
Expected: FAIL — `Cannot find module './catalog.mjs'`.

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/catalog.mjs`:

```js
// Pure renderer for the hidden, screen-reader-only article catalog that the
// browser's built-in AI (Ask Gemini / Claude extension) reads from the page's
// rendered text. No I/O, no dependencies — kept isolated so it is unit-testable.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, (c) => ESC[c]);
}

// articles: [{ slug, name, iso, text? }]
export function buildCatalog(articles) {
  const sorted = [...articles].sort((a, b) =>
    String(b.iso || '').localeCompare(String(a.iso || '')));

  const rows = sorted.map((a) => {
    const text = a.text && String(a.text).trim();
    return '<article>'
      + `<h3>${escapeHtml(a.name)}</h3>`
      + (text ? `<p>${escapeHtml(text)}</p>` : '')
      + `<p>${escapeHtml(a.slug)}</p>`
      + '</article>';
  }).join('\n');

  return `<div class="sr-only" id="gemini-catalog" aria-label="Eleken blog article index">
<h2>Eleken blog — full article index (${sorted.length} articles, newest first)</h2>
<p>Each article's URL is https://www.eleken.co/blog-posts/ followed by the slug shown under its title.</p>
${rows}
</div>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/catalog.test.mjs`
Expected: PASS — prints `catalog.test.mjs OK`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/catalog.mjs scripts/catalog.test.mjs
git commit -m "feat: pure sr-only article-catalog renderer with unit test"
```

---

### Task 2: Fetch body text + inject the catalog at build

Add the invisible-but-rendered CSS, a placeholder in `index.html`, and — in the build that already runs — fetch each article's body field and inject the hidden catalog. `nodes.js` stays byte-for-byte the same shape (no body text leaks into the map data).

**Files:**
- Modify: `eleken-blog-map.css` (append one rule)
- Modify: `index.html:45` (add placeholder comment after the `#tip` div, before the scripts)
- Modify: `scripts/build.mjs` (fetch body field; build catalog; inject into `index.html`)

**Interfaces:**
- Consumes: `buildCatalog(articles)` from `scripts/catalog.mjs` (Task 1).
- Produces: the token `<!--GEMINI_CATALOG-->` in `index.html`, replaced by the build. `public/index.html` contains `<div id="gemini-catalog">`. `public/nodes.js` is unchanged in shape.

- [ ] **Step 1: Discover the Webflow body field slug**

Run:

```bash
WEBFLOW_TOKEN=xxx node -e "fetch('https://api.webflow.com/v2/collections/6368f41dd433865719aa82cd/items?limit=1',{headers:{Authorization:'Bearer '+process.env.WEBFLOW_TOKEN,'accept-version':'1.0.0'}}).then(r=>r.json()).then(j=>console.log(Object.keys(j.items[0].fieldData)))"
```

Expected: an array of field slugs. Identify the rich-text body field (likely `post-body`, `post-rich-text`, or `rich-text-body`). If it is not `post-body`, set `BODY_FIELD` in Task 2 Step 4 accordingly. (If writers maintain a short per-article excerpt/meta field, using that instead of the full body is even better for the snapshot cap — note it and pick it here.)

- [ ] **Step 2: Add the `sr-only` rule to CSS**

Append to `eleken-blog-map.css`:

```css
/* Screen-reader-only catalog: rendered (so the browser's built-in AI reads it)
   but invisible to sighted users. Never use display:none here — that removes it
   from the page text snapshot the AI receives. */
.sr-only{
  position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;
}
```

- [ ] **Step 3: Add the placeholder to `index.html`**

Between the `#tip` div (line 45) and the first `<script>` (line 47), insert on its own line:

```html
<div id="tip"><div class="t"></div><span class="d"></span><div class="s"></div></div>
<!--GEMINI_CATALOG-->
<script src="nodes.js"></script>
```

(A bare HTML comment is invisible and harmless when the page is served un-built locally.)

- [ ] **Step 4: Fetch body + inject in `build.mjs`**

At the top of `scripts/build.mjs`, extend the `fs` import and add the catalog import + the two constants:

```js
import { writeFileSync, copyFileSync, mkdirSync, readFileSync } from 'fs';
import { buildCatalog } from './catalog.mjs';

const BODY_FIELD = process.env.BODY_FIELD || 'post-body';
const CATALOG_CHARS = 500; // per-article lead length in the hidden catalog

const stripHtml = (html) =>
  String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
```

In `build()`, replace the `nodes` construction:

```js
  const nodes = rawItems.map((item) => {
    const fd = item.fieldData;
    const slug = fd.slug;
    const name = fd.name;
    const { year, date, iso } = parseDate(fd['original-publish-date']);
    const url = `https://www.eleken.co/blog-posts/${slug}`;
    return { slug, name, year, date, iso, url };
  });
```

with a version that also captures the catalog text (kept separate from `nodes`):

```js
  const enriched = rawItems.map((item) => {
    const fd = item.fieldData;
    const slug = fd.slug;
    const { year, date, iso } = parseDate(fd['original-publish-date']);
    return {
      slug,
      name: fd.name,
      year, date, iso,
      url: `https://www.eleken.co/blog-posts/${slug}`,
      text: stripHtml(fd[BODY_FIELD]).slice(0, CATALOG_CHARS), // catalog only
    };
  });
  // nodes.js stays metadata-only — body text never enters the map's data file.
  const nodes = enriched.map(({ text, ...meta }) => meta);
```

Then replace the static-assets copy block:

```js
  // Static assets copied as-is (sources stay in repo root for local dev).
  for (const file of ['index.html', 'eleken-blog-map.css', 'eleken-blog-map.js']) {
    copyFileSync(join(ROOT, file), join(OUT, file));
  }
```

with:

```js
  // CSS + JS copied as-is.
  for (const file of ['eleken-blog-map.css', 'eleken-blog-map.js']) {
    copyFileSync(join(ROOT, file), join(OUT, file));
  }

  // index.html gets the hidden article catalog injected at its placeholder.
  const withText = enriched.filter((a) => a.text).length;
  console.log(`Injecting catalog: ${enriched.length} articles, ${withText} with body text.`);
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  if (!html.includes('<!--GEMINI_CATALOG-->')) {
    console.error('ERROR: <!--GEMINI_CATALOG--> placeholder missing from index.html.');
    process.exit(1);
  }
  writeFileSync(
    join(OUT, 'index.html'),
    html.replace('<!--GEMINI_CATALOG-->', buildCatalog(enriched)),
  );
```

- [ ] **Step 5: GREEN — build and inspect the output**

Run (uses the `WEBFLOW_TOKEN` already required by the build; pass `BODY_FIELD=…` if Step 1 found a different slug):

```bash
WEBFLOW_TOKEN=xxx node scripts/build.mjs
node -e "const s=require('fs').readFileSync('public/index.html','utf8'); console.log('div:', s.includes('id=\"gemini-catalog\"'), 'articles:', (s.match(/<article>/g)||[]).length, 'no placeholder:', !s.includes('GEMINI_CATALOG'))"
node -e "console.log('nodes.js unchanged shape:', require('fs').readFileSync('public/nodes.js','utf8').startsWith('const NODES = [') && !require('fs').readFileSync('public/nodes.js','utf8').includes('\"text\"'))"
```

Expected: `div: true articles: <~530> no placeholder: true`, then `nodes.js unchanged shape: true` (proves body text did NOT leak into the map data).

- [ ] **Step 6: GREEN — confirm invisible to users, present to the text layer**

```bash
node scripts/serve.mjs public
```

Open `http://localhost:8765`. The map is **pixel-identical** to before. In the console:

```js
[getComputedStyle(document.getElementById('gemini-catalog')).position,
 document.getElementById('gemini-catalog').getBoundingClientRect().width <= 1,
 document.body.innerText.includes(NODES[0].name)]
```

Expected: `["absolute", true, true]` — clipped (invisible) yet in `innerText` (the layer the AI reads). Console clean.

- [ ] **Step 7: Commit**

```bash
git add eleken-blog-map.css index.html scripts/build.mjs
git commit -m "feat: inject hidden sr-only article catalog (Webflow body text) at build"
```

---

### Task 3: Runtime verification against the browser AI (the black box)

Confirm empirically that the built-in AI reads the catalog and measure the snapshot size cap. This is the only way to validate the black box; do it on the deployed URL (or a Vercel preview).

**Files:** none (verification only).

- [ ] **Step 1: Temporarily add a tail sentinel**

After a build, edit `public/index.html` to insert, as the **last** `<article>` inside `#gemini-catalog`:

```html
<article><h3>SENTINEL ELEKEN_AI_2026</h3><p>Hidden catalog end marker for testing.</p><p>sentinel-marker</p></article>
```

Serve it (`node scripts/serve.mjs public`) or deploy a preview.

- [ ] **Step 2: Readability test**

Open the page in Chrome, open **Ask Gemini** (and/or the Claude extension), and ask: *"Which Eleken articles on this page are about design systems? List titles and slugs."*
Expected: it names several real articles with slugs. If it only echoes the truncated sidebar titles and nothing from the catalog → the `sr-only` snapshot assumption failed; STOP and reassess (do not ship).

- [ ] **Step 3: Cap test**

Ask: *"What is the sentinel marker at the end of the hidden index on this page?"*
Expected: it answers `sentinel-marker` / `SENTINEL ELEKEN_AI_2026` → the **entire** catalog survived the snapshot. If it answers Step 2 fine but can't find the sentinel → the tail is truncated. Remediate in this order and re-test: (a) lower `CATALOG_CHARS` in `build.mjs` (e.g. 500 → 250) to shrink the block; (b) drop body text, titles + slugs only; (c) cap the catalog to the newest N (add a `slice` in `buildCatalog`) and `console.log` the dropped count in `build.mjs`.

- [ ] **Step 4: Remove the sentinel and record the result**

Delete the sentinel article. Record whether all 530 fit, at what `CATALOG_CHARS`, or whether a newest-N cap was needed — this is the empirical fact the design depended on.

- [ ] **Step 5: Commit any remediation**

```bash
# only if CATALOG_CHARS or buildCatalog was changed in Step 3
git add scripts/build.mjs scripts/catalog.mjs
git commit -m "fix: trim hidden catalog to fit the browser-AI page-content snapshot cap"
```

---

## Self-Review

- **Spec coverage:** browser-built-in AI is the only runtime AI, no key/proxy/LLM in-repo (Architecture + Global Constraints); article text taken straight from Webflow, no AI generation (Task 2); refresh via the existing hook, no new pipeline/Action (Architecture); sr-only rendered text (Task 2 CSS + Task 1 renderer); all-530 newest-first (Task 1 sort); body text kept out of `nodes.js` so the map stays fast (Task 2 `enriched`/`nodes` split); empirical cap validation with a defined fallback (Task 3).
- **Type consistency:** `buildCatalog(articles)` / `escapeHtml` (Task 1) are consumed with those exact names in Task 2; each `article` carries `{slug, name, iso, text}`, matching the `enriched` objects the build passes.
- **No invented complexity:** no `ANTHROPIC_API_KEY`, no `summaries.json`, no GitHub Action, no hashing — all removed. Only credential is the pre-existing `WEBFLOW_TOKEN`.
- **Known external unknowns (flagged, not hidden):** the Webflow body field slug (Task 2 Step 1 discovers it) and whether the catalog fits the browser-AI snapshot cap (Task 3 measures it, with a defined fallback).
