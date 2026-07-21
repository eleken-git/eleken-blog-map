# Execution Prompt — Gemini-Readable Article Catalog (sr-only)

Paste this to a fresh Claude Code session (in this repo) to implement the plan.

---

Implement the plan at `docs/plans/2026-07-20-gemini-sr-only-catalog.md`.

Use the **superpowers:subagent-driven-development** skill: dispatch one fresh subagent per task, run the task's verification, review, then move on. Do the tasks in order (1 → 3).

**Context you must not lose:**

- The runtime AI is the **browser's built-in assistant** (Chrome Ask Gemini / the Claude extension). It runs in the visitor's browser and needs **no API key**. This repo builds no assistant and calls no LLM. Do **not** add an API key, a proxy, a vector DB, a `summaries.json`, or a GitHub Action — an earlier draft wrongly added an LLM descriptor pipeline; it was removed on purpose. If tempted, re-read "Why this shape".
- The only job is to put the **article text that already exists in Webflow** onto the page in a hidden `<div class="sr-only">`, injected by the build that already runs.
- Must be **`sr-only` (clip pattern), never `display:none`** — `display:none` is dropped from the text snapshot the browser AI reads. This is the load-bearing fact.
- **Newest-first ordering is mandatory** (truncation must drop the oldest, never the freshest).
- **Body text goes only into the hidden catalog HTML, never into `nodes.js`** — keep the map data light.
- Do **not** touch: the inlined D3 bundle (lines 1–3 of `eleken-blog-map.js`), the map logic, the `NODES` shape, `vercel.json`, or the existing Webflow→Vercel deploy hook.

**Things that need real credentials / a human (do not fake — stop and ask):**

- Task 2 Step 5 (the build) needs the real `WEBFLOW_TOKEN` — the same one already configured in Vercel. No other secret is involved.
- Task 2 Step 1 **discovers the Webflow body field slug** by inspecting one item's `fieldData`. Everything assumes `post-body` unless that step finds otherwise (or a short excerpt field is preferred for the cap) — surface the real slug before proceeding.
- Task 3 is a **manual browser-AI test** (Chrome Ask Gemini / Claude extension) — it cannot be automated. Report the empirical result (all 530 fit at `CATALOG_CHARS=500` / needed a lower value / titles-only / newest-N cap) back to the user; the design's cap assumption depends on it.

Task 1 (the pure renderer + its unit test) needs **no token** and can be done immediately.

**Definition of done:** map looks pixel-identical; `public/index.html` carries `<div id="gemini-catalog">` with ~530 newest-first entries; `public/nodes.js` shape is unchanged (no body text leaked in); `node scripts/catalog.test.mjs` passes; and Task 3's browser-AI readability test passed on the deployed URL.

If a verification fails, use **superpowers:systematic-debugging** before changing the plan. The one genuine design risk is Task 3 (the snapshot cap); the plan already carries its fallback.
