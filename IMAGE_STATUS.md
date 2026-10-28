# Image engine status

Last updated: after Step 5 Phase 2 (style recreation). Cutouts are blocked. Contract: `IMAGE_CONTRACT.md`. Licences: `LICENSES-MODELS.md`.

## Read this first

- Step 1 outputs use a **synthetic drawing** (`public/test-assets/synthetic-photo.svg`, labelled as such).
- Step 2 outputs use **your 8 images in `test-images/`**. They are finished artwork and film stills (posters, anime frames, one dark render, one phone snapshot), **not video frames**. Two carry baked-in watermarks or text. Nothing here says how thumbnails will look on real **video frames**, which are softer, more compressed and often lower resolution, and which will contain a person moving, not a posed shot. Frame mining from video is deferred (Step 6).
- Titles for the test images were written by me (`tests/image-engine/thumbnail-cases.json`); one is five words on purpose.

## Steps

| Step | What | State |
|---|---|---|
| 1 | Plan, patcher, Fabric, fonts | **Done, see below** |
| 2 | Thumbnail composer and phone-size checker | **Done, see "Step 2" below** |
| 3 | Text-first carousels (8 slide types, 3 themes, phone-size checker) | **Done, see "Step 3" below. No photos, no cutouts** |
| 4 | Background removal (ISNet, BiRefNet_lite), `/lab` page | **Cutouts are BLOCKED, parked.** The lab page and pipeline exist; no real model produced a cutout. See "Cutouts: blocked, and why" |
| 5 | Style learning. Phase 1 read and sorted the references; Phase 2 stores and recreates the styles | **Phase 1 and Phase 2 done, see "Step 5" below** |
| 6 | Hook into the app behind the mock engine's names | Not started |
| 7 | Frame mining from video | **Deferred, not tested.** Waits until you say the video engine can supply clips |

## Step 1: what exists

- `src/image-engine/types.ts`: Plan, layers (image, text, shape), patch, results.
- `validate.ts`: plain-language validation of a whole plan (hand-written, no library).
- `patcher.ts`: `applyPatch` (atomic, validates the resulting plan, returns an inverse) and `History` (undo, redo, labels, redo cleared by a new change). Every undo and redo is itself a patch, so the revision always moves forward.
- `fonts.ts`: loads the six bundled font files and waits for them before any drawing or measuring.
- `draw/text.ts`: wrapping and fitting that **measure the loaded font**; fit-to-box with a minimum size; highlight-word runs; alignment and vertical alignment.
- `draw/geometry.ts`: cover-crop with a focal point, contain-fit, corner-radius clamp, logo placement.
- `adapter.ts` and `fabric-adapter.ts`: the thin `CanvasAdapter` and its Fabric 7 implementation. Only that one file imports Fabric.

Picks, as asked: Playwright Test driving the installed Chrome; hand-written validator; a detached `StaticCanvas` for headless drawing.

## Output files to open (`out/image-engine/`, git-ignored, rebuilt by the test run)

| File | What it shows |
|---|---|
| `step1-carousel-slide.png` (+ `.plan.json`) | 1080x1350 slide: masked cover-cropped image, accent bar, auto-fitted headline with a highlighted word, body, logo, handle, slide number |
| `step1-carousel-slide-quarter-size.png` | the same plan exported at scale 0.25 (270x337) |
| `step1-quote-card.png` (+ `.plan.json`) | 1080x1080 quote card with a highlighted word |
| `step1-patch-before.png`, `-after.png`, `-undone.png`, `-redone.png` | one patch (new text colour, new background, new badge), then undo, then redo. `undone` is **byte-identical** to `before` |
| `step1-after-drag.png` | a real mouse drag in Chrome proposed a patch; it was applied and the box moved |
| `step1-highlight-check.png`, `step1-findings.json` | highlight test render; facts measured in the run |

## Step 2: thumbnail composer and checker

**What exists**
- `thumbnail/compose.ts`: `composeThumbnails(request)` returns 3 options per picture, each a plain plan (so each can be edited with patches later):
  - `plate`: title in white (or dark, whichever contrasts more) on a solid brand-colour plate, low on the picture.
  - `outline`: big white title with a dark outline and shadow, over a soft dark fade (stacked translucent strips, because plans have no gradients).
  - `panel`: a dark panel with the title (last word highlighted in the brand highlight colour) and the picture in the rest. 16:9 puts the panel on the left; 9:16 puts it under the picture, above the area the Shorts UI covers.
- `thumbnail/focal.ts`: a guess at where to centre the crop (where there is most detail and colour, pulled towards the middle). **It is not face or subject detection** and it gets things wrong, see below.
- `lint/thumbnail-lint.ts`, `thumbnail/check.ts`: draw each option, draw a **320 px-wide copy**, draw the same plan again **with the title hidden** (to measure what the title really sits on), then run 9 checks. Each is pass or fail with a plain sentence. Every number comes from the drawn pixels or the plan; every threshold is in one block at the top of `thumbnail-lint.ts` and is **a working guess, not a measured fact about what performs well**.

| Check | Rule (current threshold) |
|---|---|
| words | title has at most 4 words |
| readable | title letters at least 18 px tall on the 320 px copy |
| contrast | text against what is behind it at phone size: 90% of that area must reach 4.5:1 (measured on the rendered picture); for outlined text, letters against their outline; highlight word against its highlight |
| overlay | title clear of approximate platform zones: YouTube duration badge (16:9); Shorts bottom area and right-hand buttons (9:16) |
| margins | title and plate at least 4% of the shorter side from every edge (stroke and highlight padding counted) |
| resolution | photo stretched at most 1.5x to fill its box, after cropping |
| crop | the crop keeps at least 50% of the photo's area (a stand-in for "did we cut the subject off", since faces cannot be detected) |
| brightness | cropped photo's average brightness at least 0.16 |
| sharpness | detail score (variance of the Laplacian, at up to 640 px wide) at least 100 |

**Output files** (`out/image-engine/step2/`, git-ignored)
- `<image>-<aspect>-sheet.png`: contact sheet per image: the source, then each option at phone size labelled PASS or FAIL with the failed reasons. **Start here.**
- `<image>/<aspect>/<layout>.png` full size (1280x720 or 1080x1920), `-phone.png` (320 px), `.plan.json`, `.lint.json`.
- `summary.md` and `summary.json`: one table of every check for every option.
- `bad-variants/`: five deliberately broken options (low contrast, tiny text, title under the YouTube badge, title against the edge, six-word title) with their lint JSON, to prove each check can fail on its own.

**Result of this run** (34 tests pass in Chrome)

| Image | 16:9 plate / outline / panel | Why anything fails |
|---|---|---|
| 360.jpg (1200x675) | pass / pass / pass | |
| GCKR3575.JPG (3024x3024) | pass / pass / pass (and 9:16 all pass) | |
| GHWd3WIW0AICE11.jpg (736x737) | **fail** / **fail** / pass | resolution: 736 px stretched 1.74x to 1280. The panel layout only needs 794 px, so it passes |
| filters...(1).jpg (960x540) | pass / pass / pass | |
| filters...webp (750x422) | **fail** x3 | resolution: stretched 1.71x |
| wallpaperflare (3840x2160, very dark) | **fail** x3 | words (5-word title, on purpose), brightness 0.12, sharpness 43 |
| wp13065863 (1807x2560, portrait) | **fail** / **fail** / pass (9:16 all pass) | crop: a wide crop of a tall photo keeps 40% and loses the head |
| wp13337965 (1500x900) | pass / pass / **fail** | sharpness 85 on the cropped panel area |

Time to compose, draw, check and export all options for one picture: about 0.4 to 1.0 s per picture in this run (one machine, not a benchmark).

**What I changed after looking at the pictures** (the first run had passes that hid real problems): the 9:16 outline and panel were 40 px from the left edge and the margin check caught it (layout bug, fixed); the outline's dark band had a hard edge across faces (now a soft fade); the crop guess cut the rider's arm (stronger pull to the centre); a tall photo cropped wide lost the head and nothing flagged it (new `crop` check).

## Step 5: style learning, Phase 1 (read and sort)

**Input:** the folder you gave me, `Reference carousels likes/` (the brief called it `style-refs/`; there is no `dislike/` subfolder, so nothing is marked "avoid" yet). 16 pictures. **Every picture is a mosaic of several slides**, not one slide, so I cut each into slides first: 150 slides in total.

**Scope:** carousel slides and quote cards. **Recorded as "later":** thumbnail and poster references. A few sheets are poster-shaped or story-shaped (the tall orange and black sheet, the lime story mock-up); I treated them as carousel slides for now and said so in their descriptions. None of the 16 is a thumbnail.

**How it was read (Results screen, "Step 5: Style reading"):**
- `npm run style:read` (real Chrome): cuts each mosaic into slides and measures every slide from its pixels: palette (k-means on pixels, fixed start so it repeats), background, text colour and contrast, ink margins, empty space, text bands, alignment. Writes `out/image-engine/style/measurements.json` and an overlay picture per file showing the cut.
- `npm run style:aggregate`: adds those numbers up per cluster.
- Cut method per file is recorded in the measurements. Fully automatic (blobs): 4 files. Equal grid inside a box I gave: 11 files. Manual rectangles: 1 file (the scattered mock-up). The boxes and rectangles are **GUESS** (read by eye); everything computed inside them is **MEASURED**. The first automatic cut of one sheet found two false blobs; I caught it with a test and cut that sheet by grid instead.
- `Reference carousels likes/clusters.json` holds my reading (format and one-line description per picture, 4 clusters, draft spec, missing tools, unplaced). Moving a picture in the Results screen edits only the placement in that file. The reference pictures themselves are gitignored; only `clusters.json` and `grids.json` are kept in git.

**Result:** 4 clusters and 1 unplaced picture.
1. **Hot flat colour, heavy type** (6 pictures, 58 slides). Confidence medium: the structure is shared but the hot colour is four different hues, and the lime story mock-up is borderline with cluster 2.
2. **Warm editorial collage** (3 pictures, 36 slides). Confidence low to medium: three quite different decks.
3. **Quiet dark minimal** (2 pictures, 18 slides). Confidence medium.
4. **3D object with a neon accent** (4 pictures, 30 slides). Confidence medium to high.
- **Unplaced:** the blurred orange-gradient glass deck. It sits between 3 and 4.

**Limits of the measuring (not hidden):** only slides with a plain background can be measured for margins, empty space, text bands and alignment (about 40% of slides); photo-led slides give a palette only. Small accents under about 1% of a slide are often missed by the pixel count (the bright lime words in one deck were not picked up). Text bands are band heights, not font sizes. Font names, case, weights and layouts are **GUESS** (my reading), and every line in the draft specs is tagged MEASURED or GUESS. Not tested: whether any of this helps a viewer.

**Conflicts already visible between the references and our lint (to raise in Phase 2, not changed):** tiny body text in the quiet minimal cluster (below our 32 px rule); mid-grey secondary text (below 4.5:1); yellow or lime text on white; violet text on black.

**Missing tools, across all clusters:** fonts we do not bundle (heavy condensed, extended, serif italic, monospace, handwriting); photo treatments (black and white, halftone, blur) and irregular masks; 3D objects (cannot be made, not faked); glow and soft shadows; tape banners; per-word fonts inside one headline; per-line highlight bars; hard offset shadows under cards; hand-drawn loops; cut-outs of people (blocked). Cheap ones to build in Phase 2: icon row, page number, small outlined pill and round arrow button, more icons.

### Step 5, Phase 2: store and recreate

Ran on your go, with the four clusters as they were, the blurred-gradient deck left unplaced and no pictures moved.

**Output rule kept:** every slide and every quote card is its own full-size PNG (1080 x 1350, or 1080 x 1080 for quote cards) with its own plan JSON, its own lint JSON and a 320 px phone copy: `out/image-engine/style-recreation/<style>/<script>/slide-01.png` and `.../quote-cards/card-01.png`. 124 files (4 styles x 4 decks x 7 slides + 4 x 3 cards). Nothing is a contact sheet; a test checks that every PNG is exactly one slide's size. Each plan can be patched and re-checked on its own (tested).

**Stored styles:** `src/image-engine/styles/<name>/style.json` plus `assets/*.svg` for `hot-flat`, `editorial-collage`, `dark-quiet`, `object-neon`. `STYLE_FORMAT.md` explains every field. A schema (hand-written, plain-language messages) rejects bad files; 17 kinds of mistake and 10 kinds of bad SVG are tested. **A new style is a new folder, no code changes** (tested: a copied folder with another colour is picked up and drawn; a broken folder is reported and not loaded). SVG assets take their colours from the palette, so one graphic works in every palette.

**Layouts:** a catalogue of 19 layout variants (3 for cover, content and step; 2 for stat, checklist, before/after, quote, closing). Each style lists at least 2 rules per slide type and picks by the slide's content (headline length, body length, list length, number length, quote length) and its position (first or second of its type, place in the deck). Every style uses at least 2 different layouts per slide type across the sample decks (tested, see `variants-used.json`). Palettes follow a per-style rhythm.
**Honest limit:** all four styles draw from the same 19 layouts. For cover, content and step the styles choose different pairs out of 3, so their compositions differ. For stat, checklist, before/after, quote and closing the catalogue has only 2 variants, so every style uses the same two and the difference between styles there comes from colour, type, shape, spacing, chrome and parameters, not from composition. More variants are the main way to get the styles further apart.

**Tools built (cheap and reusable):** outlined pill and round arrow button; page number and a top strip; tape banner (rotated repeating text); soft glow (stacked circles); a flat UI card (bars or line); per-line highlight bars that hug each line; highlights that mark only the first occurrence of a word or a whole line; SVG asset loader. Plan additions needed: `hugLine`, `lines` and `onlyFirst` on a highlight. Checker changes: decorative text is exempt; centred slides may have symmetric margins instead of a left edge on the margin; overflow of the space a text was given is now visible to the "fit" check.
**Not built, with reasons:** photo treatments (black and white and halftone) and photo-led layouts (no photos in the sample scripts); cut-outs (blocked); 3D objects and glass shapes (cannot be made here, a flat shape would be a worse substitute); serif italic, condensed, extended, monospace and handwriting fonts (not bundled; a lighter sans would be a worse substitute); per-word fonts and italics inside a headline; hand-drawn marks that look hand drawn; icon rows with captions (no layout needs them yet); the tape banner exists but no layout uses it yet.

**Results (self-checked, phone-size lint per slide):**
| style | slides passing | notes |
|---|---|---|
| hot-flat | 30 of 31 | The one failure is the deliberately awkward 27-word cover (does not fit even at the 84 px floor; one-word last line). |
| editorial-collage | 31 of 31 | |
| object-neon | 30 of 31 | The awkward cover again: it does not fit next to the corner graphic. |
| dark-quiet | 0 of 31 | **By design.** The style keeps the references' tiny type (body 28 px, labels 26 px), which breaks our 32 px minimum, so every slide fails the "size" check. Written in the style's `knownLintConflicts`; the style was not changed to hide it. |
A pass means none of the seven measures failed. It does not mean the slide matches the reference.

**What I think, after opening the slides:**
- **Close: hot-flat.** Colour, weight of the type, bars behind words, hard offset shadows, big numerals and the strip header are recognisably the references. Weak points: Schibsted Grotesk is wider and softer than the condensed or extended faces used; roughly half of the reference slides are photographs, which are not reproduced; no tape banners are used yet.
- **Close in spirit, fails our rule: dark-quiet.** The space, the thin outlined pills, the light sans, the sage and near-black rhythm and the underlined word are right. It fails the size check on every slide on purpose; no photos or serif italic.
- **Partly: object-neon.** Colours, sentence-case bold headlines, tidy placement, mint highlight boxes and a flat interface card on the cover are there. The glossy 3D objects are the look and they are missing, so most slides read as text on a dark or light panel. Weak. One deliberate change from the reference: darker green for text accents on the light palette (mint on white would be about 2:1).
- **Weak: editorial-collage.** The flat type slides in butter yellow, cream and dark are fine, but the references' character is photographs, cut-outs, stickers and the serif-italic word, none of which is here. The hand-drawn circle and the flower are tidy shapes floating on their own and look arbitrary without the photos they belong with.
- Cross-cutting: stat and checklist slides are similar from style to style (see "Honest limit"); orphan fixes sometimes shrink a headline a little to avoid a one-word last line (listed in each slide's notes).

**Not tested:** real phones; other fonts; the slides' performance with any audience; photo layouts (not built); the lime hue was used for hot-flat, the yellow and orange-red decks of the same cluster are one palette edit away but not drawn.

## The Results screen (where to look at everything)

Run `npm run dev` and open **http://localhost:5173/lab**, or click **Results** in the left menu (it only exists on the dev server, never in a production build). Sections, newest first: Step 5 Style recreation (every slide its own card, compare with the references, verdict matches / close / off / wrong), Step 5 Style reading, Step 3 Carousels, Step 4 Cutouts, Step 2 Thumbnails and checks, Step 1 Plan and patch proof. Each shows a "last run" time and a Refresh button. Every item has good / meh / bad and a one-line reason, autosaved in the browser (key `ie-lab-v1`), and **Export verdicts JSON** at the top. "Add pictures" lets you try your own picture: thumbnails and the checker (Step 2) and cutouts (Step 4) run live in the browser; those pictures are not saved between visits.

**RULE for every new step:** its tests finish by calling `writeStepResults()` from `tests/image-engine/results.ts`. That writes `out/image-engine/results/<step>.json`, and the Results screen shows it on its own, newest first, with pictures, the checker's PASS or FAIL and reasons, facts (model, backend, times), a TOY or REAL tag, a failure if there was one, and verdict boxes. No page edits are needed (a test proves it). The folders under `out/` are backup only.

## Step 3: text-first carousels

Text only: every slide is drawn in code from a script and a theme. No photos, no cutouts, no external images, no network.

### What exists
- `src/image-engine/carousel/`: `composeCarousel(script, theme)` returns 7 slide plans (4:5, 1080 x 1350); `checkCarousel` draws and checks them; `lintSlide` is the checker.
- **Script JSON** (`CarouselScript`, 7 slides, brand handle) with 8 slide types: cover, content, numbered step, stat callout, checklist, before/after split (used as myth/fact), quote, closing (handle and call to action).
- **Four scripts** in `tests/image-engine/carousels/`: how-to list (LinkedIn profile), myth vs fact (remote work), story in steps (first 100 newsletter readers), and one **deliberately awkward** script (27-word cover headline, body copy that would end on one word, long checklist items, a long stat value, a long button label). Copy is written for layout. The stat figures are placeholders and say so on the slide.
- **Three themes** (`themes.ts`), tokens only: Paper (light, editorial, underlined words), Midnight (dark gradients, round shapes, filled highlight boxes) and Pop (flat yellow and black, hard edges, offset shadows, brush strokes). Colours, fonts, sizes, corner radius, outline weight, badge, marker and sticker style, decoration and spacing all come from the theme. A test checks that no slide uses a colour or font its theme does not own, and that the three themes give the same words and clearly different pictures.
- **Toolbox** (`toolbox.ts`), all drawn in code: gradient and solid backgrounds, numbered badges, three marker styles (highlight box, wavy underline, brush stroke), arrows, swipe cue, progress dots, quote marks, 8 icons (check, cross, bulb, clock, star, bookmark, chat, arrow-down), three sticker shapes (pill, tag, starburst), dividers, big decorative shapes, buttons.
- **The plan format grew** (Step 1's three layer kinds were not enough): a `path` layer (SVG path data inside the layer's box), gradient fills on shapes, and a `role` on every layer (decor, content or container) so the checker knows what may overlap. Old plans still work. Tested by pixel: a path lands where the plan says, offset paths land at the right place, gradients run the right way, and bad paths and gradients are refused in plain words.
- Every slide is an ordinary plan, editable by patches. Tested: a text patch, undo (identical pixels) and redo.

### The checker (seven checks, working guesses in one block, `CAROUSEL_LIMITS`)
Text fits its box. Text at least 32 px on the 1080 wide slide (about 9.5 px on a 320 px phone copy). Contrast 4.5:1 over 95% of the pixels behind each word, **measured on rendered pixels with the words removed**. No one-word last line. Content sits on the theme margin. Nothing within 48 px of an edge. No overlapping elements (a container may hold content fully; content may not stick out of it). Geometry comes from the plan with the real loaded fonts; only contrast is measured on pixels.
Deliberately broken variants (`out/image-engine/step3/bad-variants/`): one slide broken once per check, each failing for the right reason, made with patches.

### Results
12 combinations (4 scripts x 3 themes), 7 slides each. **The three normal scripts pass every check in every theme.** The awkward script fails on its cover in Paper and Midnight (the long headline pushes the sub line into the dots) and passes in Pop. That is what the checker is for, but a pass here only means "none of these seven measures failed". It does not mean the slide is good.
Where the layout code helps on its own: it shrinks type to fit (never below 84 px on a cover, 64 px on other headlines), narrows boxes or sets line breaks by hand to avoid a one-word last line, and grows a button around a long label. Those choices are listed per slide in the `notes` of `slide-N.lint.json`.

### Looked at by me (what is still weak)
- **Generic.** Content, step and checklist slides are a heading and a paragraph on a flat colour, placed in the upper middle with a lot of empty space below. They are tidy and a little dull. No slide uses a photo, a diagram or a real illustration. Three themes share the same layouts, so the difference is colour, type and shape language, not composition.
- Pop's starburst sticker is busy at small sizes ("MYTH" in a black burst is hard to read at phone size, though it passes the size check at 34 px).
- Underline marker (Paper) and brush marker (Pop) are positioned by estimating where letters sit inside their line. It looks right in these fonts and sizes; a different font could put it a few pixels off. Not tested with other fonts.
- Shrunk type is legal but ugly: the awkward cover at 84 px is a wall of text, and the checker only calls it a problem because of what it bumps into.
- The `before/after` "before" half is deliberately muted; at phone size it reads as disabled rather than as "the wrong way".
- Decoration (rings, orbs, blocks) is limited to the top 360 px of covers and closings so it cannot sit under text. That makes it predictable.

### Not tested
Other fonts or languages than the two bundled Latin ones (the arrow glyph is not in the fonts, so arrows are drawn as paths); real phones (the phone copy is a 320 px render, not a screenshot from a phone); Instagram or LinkedIn cropping or compression; Safari and Firefox; dark-mode feed rendering; whether any of these slides performs better than another. There is no claim here about engagement.

## Cutouts: blocked, and why

Cutouts are parked. Plainly: **no real background-removal model has produced a cutout on this machine.** ISNet general-use is blocked on licence grounds (the authors state no licence for the weights and the training data is non-commercial research only), and was never downloaded. BiRefNet_lite (MIT) downloads and loads on WebGPU but fails on its first picture inside onnxruntime-web (a shader compile error in 1.22; newer versions abort in WASM earlier), and on WASM it runs out of memory. Details and what was tried are in "Step 4" below and in `LICENSES-MODELS.md`. Nothing in the carousels depends on cutouts.

## Step 4: background removal and the lab (parked)

**Plain result: the machinery works and is tested on WebGPU and WASM, but no real background-removal model produced a cutout here.** ISNet is blocked for licence reasons (never downloaded). BiRefNet_lite downloads and loads on WebGPU but fails on its first picture; on WASM it runs out of memory. Every cutout image in `out/image-engine/step4/` is from the **toy self-test model**, which turns brightness into a mask and is labelled as such. **None of those pictures says anything about real cutout quality.**

Machine (Chrome 156 headless via Playwright, Windows 10): NVIDIA Blackwell GPU, WebGPU yes (16 storage buffers per shader, shader-f16 yes), 24 cores, 32 GB, cross-origin isolated (threaded WASM available).

### What exists
- `src/image-engine/cutout/`: `BgRemover` (`load(onProgress)`, `remove(image) -> { cutout PNG Blob, mask, timings }`, `dispose()`), a module Web Worker doing all inference with **onnxruntime-web 1.22.0** (reason in LICENSES-MODELS.md), automatic WebGPU with fallback to WASM, plain-language errors, Cache Storage so a model downloads once, size and sha256 checks before use. No CDN at runtime: model files in `public/models/`, runtime files in `public/ort/`.
- `npm run fetch:models` downloads approved models with pinned size and hash and builds the derived file; blocked models are never fetched. `npm run check:licenses` fails on disallowed or unclear licences (models, 125 npm packages, fonts). **It passes**, with one printed exception: `lightningcss` (MPL-2.0, a Vite build tool, not shipped). Your call.
- Mask helpers (pure, 11 unit tests): edge feathering (soft edge), small-hole filling (holes up to a share of the picture size), edge decontamination (pulls colour from inside the subject onto the half-transparent rim to reduce halos). Subject helpers: bounding box, robust bounding box, centre of mass, area fraction. Decontamination is tested for running and for changing pixels, **not for how it looks on real hair**: no real mask was available.
- `/lab` (dev only, `npm run dev`, then open `/lab`): every picture in `test-images/` with original, cutout on checkerboard, dark, light and coloured backgrounds plus the mask; load time, inference time, download size, backend, failures; "pick best" per picture; good / meh / bad with a one-line reason; all Step 2 thumbnails with the checker's PASS or FAIL beside them and a flag where you and the checker disagree; Export verdicts JSON; autosaved in the browser. Tested in Chrome by a script (loads, ISNet shown blocked, self-test runs, verdicts survive a reload, export contents). Uploading your own pictures from the lab page is **not built**; use `test-images/`.

### Models
| Model | Result here |
|---|---|
| ISNet general-use | **Blocked, not downloaded.** Weights licence not stated by the authors; training data non-commercial. See LICENSES-MODELS.md. Needs your decision |
| BiRefNet_lite (MIT) | 213.6 MB download (224.0 MB after the graph split). **WebGPU:** loads in about 5 s, then fails on the first picture (a shader compile error in onnxruntime-web 1.22; newer onnxruntime-web versions abort in WASM before the GPU path gets that far). **WASM:** runs out of memory. Reported as a clear error, page stays usable. Not solved |
| Self-test (toy) | Works on WebGPU and WASM, same subject area on both within 1% on all 8 pictures |

What I tried for BiRefNet_lite: splitting every wide Concat/Split so WebGPU's buffer limit is respected (works, kept), widening the device limit to the adapter's 16, onnxruntime-web 1.22 to 1.30, one thread, graph optimisation off. The remaining failures are inside onnxruntime-web, not our code. Not tried: an ONNX re-export of the model with simpler operators, other runtimes, another model.

### Timings (this machine, self-test only, 2048 px working size, not a benchmark)
WebGPU inference 16 ms, WASM 8 ms on the toy: meaningless for real models. Real-model timings: **none measured**.

### Not done or not tested
- **No real cutout has been judged.** Hard cases (hair, glass, low light, busy backgrounds) were **not added**, because there was no real model to test them on. Adding them first would be pictures of nothing.
- Safari, Firefox, other GPUs, Linux, Mac: not tested. BiRefNet_lite on a different GPU may behave differently.
- Reading pictures with EXIF rotation, very large photos beyond 3024 px, memory use of the real model: not tested.
- The lab's own upload button and "pick best" with real results: pick-best radios exist but have only been shown in their empty state.

## Plan after this step
Carousels are done (Step 3 above). Cutouts stay blocked until you decide on a model. Not started: the style system (richer toolbox, style spec JSON, extraction from reference thumbnails) and wiring into the app. Frame mining from video (Step 6) stays deferred and untested.

## Known problems and not tested (Step 2)

- **Titles can cover the subject.** Layouts place the title by position, not by where the face is. In the full-size `wp13337965 ... outline.png` the title sits over the man's chin and hand. Nothing checks this; it needs subject detection, which is out of scope.
- **The crop guess is not subject-aware.** It picks where there is the most detail, which can be foliage. The `crop` check only measures how much is thrown away.
- **The sharpness check cannot tell blur from flat artwork or a dark scene**, and the threshold (100) is uncalibrated. It failed the dark render and one soft crop; the anime stills passed.
- **Contrast for outlined text is always a pass** when the outline is dark and the letters white, because it compares the letters with their outline. It does not ask whether the outline itself stands out from the picture.
- The overlay zones (YouTube duration badge, Shorts buttons) are my approximate, deliberately generous rectangles. Platforms do not publish exact sizes.
- 9:16 `panel` leaves a large empty dark area at the bottom: that is the space the Shorts UI covers, so I kept the title above it.
- Baked-in watermarks and text in the source pictures (one has a news-site logo) are not detected.
- Titles are uppercased by the composer. Only Latin letters are supported (see `LICENSES-MODELS.md`).
- Not tested: Safari and Firefox; images with an EXIF rotation other than normal; very large photos (the 3024 px one was the largest); uploading an image through the app (the test uses files served by the dev server); the brand's own logo on a thumbnail (not part of these layouts).

## How to run

```bash
npm install
npm run test:image      # 55 tests in real Chrome, writes out/image-engine/ (reads test-images/)
npm run fetch:models    # once: BiRefNet_lite and the ONNX runtime files (about 224 MB)
npm run check:licenses
npm run dev             # then open /lab
npm run typecheck       # app + tests
```

It uses the Chrome installed on the machine (`channel: 'chrome'`); no browser download.

## Result of this run

21 of 21 tests pass in Chrome. Includes pixel checks for position, rotation, opacity, ellipse mask and focal-point cropping; patch atomicity; undo giving identical pixels; a real mouse drag.

Timings in this run (one machine, not a benchmark): carousel slide 160 ms, quote card 54 ms, each including creating the canvas and encoding the PNG.

## Findings you asked for

- **Headless on the main thread: works.** A canvas element that is never added to the page, drawn with Fabric's `StaticCanvas`. Two renders of the same plan give byte-identical PNGs.
- **Inside a Web Worker: does not work.** Fabric imports fine in a worker but creating a canvas fails with `document is not defined`. So all drawing runs on the **main thread**. A worker does have `OffscreenCanvas` and `fonts`, so text *measuring* and (later) background removal can run off the main thread, but Fabric rendering cannot.
- **Fabric 7 groups:** its default group layout silently re-centred my children and shifted text by half a box. I now build each layer as a fixed-size group and place children explicitly. This was found by looking at the PNG: the tests passed on the first attempt while the picture was wrong, so I added pixel-position checks.
- Exporting a fractional size rounds down (1350 x 0.25 = 337.5, exported as 337).

## Known problems and not tested

- Highlight rectangle covers the whole token including punctuation ("3." in the slide, "product," in the quote). It is also tight to descenders: in the quote card the "g" of "Onboarding" touches the top of the highlight below it. To tune in Step 3.
- **Filters (brightness, contrast, saturation, blur) are implemented but not tested.** Blur is converted from px to Fabric's fraction-of-size and is likely only approximately right.
- `placeLogo` (the corner helper) is written but not exercised by a test. The logo in the slide uses `contain` with a hand-placed box.
- Text style stroke and shadow are implemented, not tested visually.
- Latin glyphs only (see `LICENSES-MODELS.md`). The right arrow → is **not** available in the bundled fonts.
- Only Chrome was tested. APIs used that Safari or Firefox may handle differently: `FontFace`, `OffscreenCanvas` 2D (Safari 16.4+, Firefox 105+), `createImageBitmap`, `canvas.toBlob`. Not tested there.
- Editing: only move, resize and rotate proposals exist. Text cannot be scaled by dragging (locked on purpose; size is a style value). Re-rendering rebuilds every layer each time; fine at these sizes, to revisit if plans get big.
- Retina: Fabric's retina scaling is switched off so exports are exactly plan size. The on-screen editable canvas is therefore not sharper on high-DPI screens.

## Next (waiting for your decision)

Your call on the next step. Cutouts need a decision (approve ISNet, another permissive model, or keep working on BiRefNet_lite), or we move on without them.


## Step 6: Asset library (element-rich styles)

### Element types the references need
From the cluster readings and style specs: **icons** (line and filled), **hand-drawn arrows** (straight, curved, looping), **stickers and starbursts** (with outline and drop shadow), **tape and torn paper**, **doodles** (squiggles, zigzags, circles, underlines, brush strokes), **badges and labels**, **simple objects** (spheres, cubes, coins, cards, phones, UI cards), **coloured emoji-style objects** (rocket, heart, lightbulb, money), **textures** (halftone, grain, noise), **blobs and shapes**, and **photo cutouts**.

Covered: all of these except photo cutouts and true 3D renders. Photo cutouts need Step 4's cutout model, which is still parked.

### What was built
- Library: 6,826 elements (6,774 fetched + 52 drawn), all recolourable. 3 fetched packs (Lucide ISC, Phosphor MIT, Fluent Emoji Flat MIT; pinned versions and sha512, fetched only by `npm run fetch:assets`) plus 52 variants of 24 shapes drawn in code. `LICENSES-ASSETS.md` has source, licence, version, attribution and what was not used. `check:licenses` covers assets.
- Plan format: a new `element` layer (id, tint, colour swaps, flip, sticker outline, shadow) that works with patches and undo. Old plans load unchanged. A missing element is a warning, not a crash.
- Style format: an optional `elements` block (see `STYLE_FORMAT.md`), validated in plain words. Placement is repeatable and only uses free space.
- Test assets: `test-assets/` is private and gitignored. `npm run check:test-assets` (first step of `npm run build`) fails if anything in src, public, dist or the SHIPPABLE outputs mentions it or copies a file from it. TEST renders are labelled "TEST ASSETS: not shippable".
- Results screen: "Step 6: Asset library" with the element browser (pack, tag, licence, three recolour previews) and every recreated slide as its own card with the references beside it and a matches/close/off/wrong verdict.

### Results (SHIPPABLE, 3 styles x 4 decks x 7 slides = 84 slides)
- hot-flat 27 of 28 pass the phone-size checks (1 fit, 1 orphan; the same slide failed before elements: no new failures anywhere), editorial-collage 28 of 28, object-neon 27 of 28. About 3 elements per slide.
- TEST version: **not rendered, test-assets/ is empty.** The path is tested with temporary pictures only.

### Where it is still weak
- Objects are flat emoji-style art, not the glossy 3D renders some references show. object-neon relies on code-drawn spheres and cards plus plus-signs, which read as filler.
- hot-flat starbursts come out as solid dark shapes; the reference uses coloured ones with a printed look.
- Sticker outline and shadow are convincing for emoji; code-drawn blobs are plain.
- Placement picks by free space, not by meaning: a heart can land on a slide that is not about love. Tags are not matched to the slide's words.
- Not tested: Safari and Firefox, large-pack load time, any performance claim.

### What needs assets we do not have
- Real 3D renders (glossy objects, chrome shapes, glass): need user-supplied or licensed renders, or a generated set in a later step. A code-drawn sphere is a worse substitute.
- Photographic objects and cutouts: need photos with cutouts (Step 4 cutout model is parked), user-supplied or from a licensed pack.
- Hand-drawn illustration sets (Open Doodles style): need a pack with a pinnable archive and a clear licence.


## Step 7: Smart element placement

### What it does
- **Tags per slide.** Each slide in a script may carry `element_tags` (2 to 4 words). For the four sample decks they are **written by hand**: no model is called anywhere in the code. The interface a real model call would fill is `ElementPlanner` / `briefOf` / `plannerPrompt` / `planTags` in `src/image-engine/styles/tags.ts`: it gets the slide's copy and role (hook, step, proof number, call to action...) and the concept words, and must answer with 2 to 4 tags, which are checked.
- **Reviewable.** The tags are stored in the script, copied into the plan (`meta.elementTags`), and shown on each Results card with the elements used and whether each links to them. `applyTagPatch` changes a slide's tags with plain-word checks and returns the inverse patch, so undo is another patch; recomposing the slide then picks different elements.
- **Lint.** A new check, "Elements match the slide", flags an *unrelated element*: a picture of a thing (icon, emoji-style object, or a code shape named after a concept) whose tags have no link to the slide's tags. Pure decoration is never flagged. It only runs when the plan has tags.
- **Placement.** Style rules with `"match": "slide"` pick the best-linked element, or place none. Rules that pick among their own tags take a linked element if there is one, otherwise plain decoration, never an unrelated picture. The style's density and zones still apply. The link table (which element tags a concept reaches) is hand-written and small: it is a guess, not a measured thing.
- **Starbursts (hot-flat).** The burst took the heavy dark accent. It now takes the style's lime with a hard outline (`recolourBy`: on the lime slide the slide's own colour with the black outline; on dark and light slides the marker lime).

### Results (3 styles x 4 decks x 7 slides; hand-tagged sample, not proof that it generalises)
- editorial-collage: 40 unrelated pictures with the old random pick (23 of 28 slides flagged), 0 after; 40 pictures placed that link to their slide.
- object-neon: 10 unrelated before (11 of 28 slides flagged), 0 after; 12 linked pictures (most neon pictures are code-drawn objects, which are decoration).
- hot-flat: no pictures of things, so nothing to relate; only the starburst colour changed.
- No new phone-size failures compared with Step 6.
- TEST version: not rendered because test-assets/ is empty. Test mode uses file names as tags (for example `coin.png` is "coin"), and places none when no test picture is named for the slide's tags. Not tested with real pictures.

### Not done or not tested
- Tags are hand-written for 4 decks, so how well a model would choose them is unknown, and the concept table has not been tried on other topics.
- Quote cards have no element_tags yet.
- Some matched pictures are still poor: Fluent's plain check mark with a sticker outline looks like a blob; the stat slide's pill outline is empty (an older layout problem, not changed here).


## Step 8: Carousel editor in the app

### What exists
- **Images > Make a carousel** (`/images/carousel`, code in `src/carousel/`): 1. format (carousel 4:5 or quote card 1:1), 2. style (every stored style, with a small preview), 3. script, then the slide cards. Nothing else on the Images screen changed except one new button.
- **Script, two ways, no API key:** "Copy prompt for Claude" (topic, JSON format, rules) and a paste box that checks the JSON live with plain-language problems and where they are (it also accepts a whole chat answer with a code fence). "Write it for me" is a disabled button labelled coming soon; `ScriptWriter` in `src/carousel/script.ts` is the interface a future backend fills. A small example script lets you try the editor without writing anything.
- **Slide cards:** each slide is its own picture with phone-size check badges (plain reasons for failures), every field editable, tag chips (2 to 4), layout, shuffle elements, swap an element, regenerate from the plan, download PNG. Click the picture for full size.
- **Undo and redo** for everything above, including style and format changes. **Export:** one PNG or a zip of individual files named by deck and number. **Autosave** in this browser with the history; a refresh brings it all back.
- The engine got three small additions for this: per-slide layout choice, an element shuffle salt and element swaps (`overrides` in `composeStyled`). The old mock path is behind a flag (see ENGINE_CONTRACT.md).

### Measured (one run, not a benchmark)
- Machine: AMD Ryzen 9 5900X 12-Core Processor, 24 logical cores, 32 GB memory, win32 10.0.19045; Chrome 156.0.8078.48.
- Drawing and checking 7 slides: 2068 ms; longest block of work 119 ms (2 blocks over 50 ms); longest gap between frames 117 ms.
- Zip of the 7 drawn slides: 105 ms; no block over 50 ms. This is the export from already-drawn slides; a cold redraw costs what the drawing line says.
- **No Worker was used.** Fabric needs a document and cannot run in a Worker (found in Step 1), so drawing stays on the main thread, one slide at a time with a pause between slides, and PNG encoding is the browser's own asynchronous one. On a slower computer the same work takes longer; that was not measured.

### Tested
18 Playwright tests drive the real app: the Make a carousel button, copy prompt (clipboard), bad script, good script (also inside a chat code block), edit a headline (only that slide redraws), tags, change style, layout/shuffle/swap/regenerate with undo, full size, export of a PNG and a zip (names, PNG signature, size, CRC), refresh and recover (script, edits, style, undo history, unsent paste), a broken saved project, quote cards, keyboard and accessible names, no test asset and no network call from the carousel code, the mock flag, a phone-width screen, and the timing above. Screenshots of each state are in the Results screen (Step 8).

### Not done or not tested
- The prompt has only been read by me, not run in a real Claude chat; the quality of what Claude writes from it is unknown. The tags it asks for have the same limits as in Step 7.
- Only installed Chrome. Safari, Firefox, a real phone and a screen reader were not tried.
- The clipboard fallback (when the browser blocks copying) is written but not run.
- One project at a time; it does not appear in the Images list, and does not use Branding colours or fonts.
- See the Step 8 section of the Results screen for the confusing things found by using it, which are fixed and which are not.

### Fix after Step 8: Quiet dark page number
- The Quiet dark style's labels and page numbers went from 26 px to 32 px (same muted grey, same weight, same place; the number is a little wider). Before: all 7 slides of the sample deck failed the "size" check. After: 5 of 7 still fail, for body text (28 px), small text such as the "Step 01" pill and "Myth" label (30 px), and the stat note (24 px). Those were left as they are to keep the style's quiet look; they are listed under `knownLintConflicts` in the style.
- The style validator now warns, when any style is loaded, about every `type` size under 32 px (cover, headline, body, small, stat, quote, label), in plain words, naming what will fail. The carousel style picker shows "Some text is below phone size" on such a style.
- The 24 px stat note is not a `type` value of the style, so the validator cannot see it; it is fixed in the stat layout code, not in the style file. Not changed here.
- Three sample scripts in all four styles: no failures in editorial-collage, hot-flat or object-neon; Quiet dark fails on 4 to 5 slides per script.


### Fix: Quiet dark is clean
- Body, small text, the stat note and the quote byline are now all 32 px in the Quiet dark style (they were 28, 30, 24 and 22); the body line height went from 1.3 to 1.5 so it stays airy. Colours, weights and spacing are unchanged. The text is a little bigger than the references (about 28 px), which is written in the style's `knownLintConflicts`.
- The stat note and byline are now style settings (`type.note`, `type.byline`, default body - 4 and body - 6) and `bodyLineHeight` is a style setting (default 1.3). The validator checks every text size, including the defaults. See STYLE_FORMAT.md.
- All four sample decks (28 slides) pass every phone-size check in Quiet dark, and the three sample scripts pass in all four styles (see the result of the full run below).


## Step 9: One-shot carousel

### What exists
- **Images > Make a carousel** now starts with one text box (a paragraph, a rough idea or an article, up to 12,000 characters) and optional chips: format (carousel or quote card), number of slides (3 to 10, usual 7; quote cards 1 to 7), tone (clear, bold, friendly, expert), style (any stored style or "Pick for me"), and the handle shown on the last slide. One **Generate** button shows real progress ("Writing the script…", "The first answer needed fixing. Asking again…", "Drawing slide 3 of 7…") and a **Cancel**. The result opens in the same editor as before (edit text and tags, layout, swap, shuffle, undo and redo, export). One Undo takes back a whole generation.
- The old "Copy prompt for Claude", "Paste script JSON" and "Try an example script" are in a closed **Advanced** fold. Carousels may now have 3 to 10 slides (they had to have exactly 7).
- **Writers** (details in ENGINE_CONTRACT.md): a dev-only provider that runs the Claude Code command line on this computer, and an API provider that needs ANTHROPIC_API_KEY on the server and is off without it. No key is in client code; `npm run check:secrets` guards that.

### What happened on this machine
- Claude Code command line 2.1.308 is installed only inside the Claude desktop app (not on the PATH); the dev writer finds it there by itself. It works and is signed in.
- Three real generations through the real Generate button (texts in `sample-inputs/`, one run each, AMD Ryzen 9 5900X 12-Core Processor, 24 logical cores, 32 GB, win32 10.0.19045):

| Text | Characters | Slides | Style picked | Script ready | All drawn | Writer calls | Validator warnings | Phone-check failures |
|---|---|---|---|---|---|---|---|---|
| A creator (batching videos) | 1221 | 7 | editorial-collage | 11 s | 12 s | 1 | 0 | 0 |
| A small business (a cafe) | 1130 | 7 | editorial-collage | 7 s | 8 s | 1 | 0 | 0 |
| An agency (client briefs) | 1202 | 7 | editorial-collage | 11 s | 12 s | 1 | 0 | 0 |

- A plain call to the command line costs about 6 to 7 seconds of start-up even for a one-word answer; the three scripts took 7 to 11 seconds. Each call is billed to the signed-in Claude account at list price (about 1 cent for the tiny test; the real ones were not measured).
- Scripts and slides are in the Results screen under "Step 9", with what is weak. Short version: all three scripts were valid first time and stayed inside the text; "Pick for me" chose editorial-collage all three times; pictures on myth and fact slides can sit across the split line; the decoration that comes from the style says nothing.
- Two things the real runs exposed and I fixed: stickers overlapping each other and a large sticker's shadow dimming the page number (spacing now grows with the picture's size), and the placeholder @yourname on the closing slide (there is now a handle box).

### Tested
- Fake-writer Playwright tests (no real call; the page's writer routes are answered by the test): generate, progress, options reaching the prompt, "Pick for me", a bad answer then an automatic retry that works, a bad answer twice (plain errors, text kept, can retry), writer not found, cancel while writing, cancel while drawing, text too long or too short, fewer slides with a note, refresh and recover (text, options, slides, history), no writer available, the API writer preferred when offered, the Advanced fold.
- Server tests with a stand-in program and a fake fetch: stdin prompt, failure messages, timeout, cancel (the program is stopped), missing command line, key only in a header and never in an answer, 401 text without the key, routes. Secrets guard tests on temporary folders.
- The real writer was run only through the opt-in `carousel-real` spec (`REAL_GENERATE=1`), not in the normal suite.

### Not done or not tested
- The API provider has never made a real call (no key here). It was tested only against a fake fetch.
- Quote cards, other slide counts, texts near the limit and other topics were not run with a real writer.
- The page's behaviour in a production build (no writer, Generate off) was reasoned about and covered by the "no writer" test, not by a built-and-served run.
- Whether Claude Code can be started this way on another computer (different install location, not signed in) is untested; the error message for "not found" is tested with a stand-in.
- There is no production server in the repository yet; the API route is a handler ready to mount.


## Step 10: Polish

### What changed
1. **Split rule (myth and fact slides).** The two split layouts now declare a keep-clear band across the split and a box round the arrow button (`plan.meta.keepClear`); the placer never puts a picture there, and a new phone-size check, "Elements stay off the split", fails if one is. Checked on all 12 split slides in the sample set (3 styles x 4 decks); a deliberately bad plan with a picture across the line, and one beside the arrow, fail with "Element crosses the split: ...".
2. **Decoration with a job.** A decoration rule must have a `role` (frame, point, gap) or the style is refused. A line under a headline (frame) works; an arrow must sit in a real gap under the headline pointing down (point); blobs, squiggles, tape and halftone only go on a slide that is not full, with extra clear space (gap). The editorial blob and circle marks were taken off the covers. A ring round a big number is supported but never fits, so no style uses it.
3. **One highlight bar.** A highlighted phrase that fits on a line (92% of its width) is kept on one line with no-break spaces, so it is drawn as one bar. A phrase longer than a line still wraps into one bar per line.
4. **"Pick for me".** Each style has a one-line `description` and a `suits` list (tones, words, slide types) in its style.json. The page scores every style from the tone, the words of the text and the slide types, with the writer's own suggestion worth one point, breaks ties from the text itself, and tells the person why ("Warm editorial collage: it suits a clear tone; the text has words it suits (i, my, week)..."). On 8 different texts it picked editorial-collage 3 times, object-neon 3, dark-quiet 1 and hot-flat 1. I wrote both the keyword lists and those 8 texts, so this shows it is not stuck on one style, not that it picks well; first-person words push toward editorial.
5. **Formats and sizes, fake writer.** Quote cards (3, square), a 3-slide and a 10-slide carousel, and a text of about 11,990 characters (one character more is refused) all go through Generate and draw with no phone-check failure.
6. **One real quote card generation** (the dev writer, sample-inputs/quotes.txt): three cards in about 11 seconds, quotes word for word from the text, no validator warnings, no phone-check failures; the style picked was editorial-collage.

### Still weak (details in the Results screen under Step 10)
Some split slides are now bare; arrows that point at something almost never fit (1 of the 48 sample slides); blobs and squiggles are still decoration; the lower-case style changes the case inside a quotation; pictures are not checked against the background colour (a brown heart on a dark slide); only one real generation per format was run.

### Not tested
The ring round a number, a highlight phrase longer than a line, real writers on 3- and 10-slide carousels, and other topics.


## Fix: highlighted words with punctuation

- **Cause:** the plan validator split a slide's text on punctuation ("5,000" became "5" and "000") while the layout cleaned each slide word and compared it with the raw highlight word, so "5,000" never matched in either place.
- **Fix:** one shared comparison, `wordKey` in `src/image-engine/draw/words.ts` (lower-case; letters, numbers, apostrophes and hyphens kept; straight and curly apostrophes the same; everything else removed). It is used by the validator, the layout (`layoutText`), the keep-together step, `marker()`, the style layouts and the script checker. "5,000", "$5,000,", "99.9%", "3.5x", "50%", "e-mail", "it's" and phrases containing them all match, including "Earn $5,000, fast." One limit: "99.9%" and "999" compare equal, because the dot and percent sign are dropped.
- **Graceful failure:** a highlight that is not in the slide's text no longer fails a slide. It is left out, the slide is drawn, and the slide card shows "Highlight 'x' not found; drawn without it." (a note on the slide, also for styles that mark whole lines). Only `validatePlan`, used for hand-written plans, keeps the strict error.
- Tested: 21 tests in `highlight-match.spec.ts` (the comparison, the validator, all four styles, the card in the app).
- Which styles show the cover "UI card" (a report, nothing changed): only object-neon, and only when the headline is 7 words or fewer and there is room (3 of the 9 sample scripts). The card is the `visual: "ui-card"` setting of the `cover-top` layout; no other style sets it (dark-quiet's `cover-top` says `none`, hot-flat's draws an arrow asset, editorial-collage has no `cover-top`).


## Step 11: The photo side (v1)

Photos, treated and framed, in carousels. Built in the engine and the style system; **not in the app yet** (the Images screen is unchanged: no upload, no treatment controls; that is next).

### What exists
- **Treatments on an image layer** (`treatments` in the plan, applied in order, drawn in the browser at the layer's own pixel size, repeatable): grayscale, duotone (two colours), halftone, film grain (seeded), brightness/contrast/saturation, gaussian blur, directional motion blur, tint, vignette, edge fades (a dark fade from the bottom and so on), colour wash. The original is never changed and nothing leaves the browser.
- **Masks:** rectangle, rounded rectangle, circle, pill, arch, diamond, six-petal flower, blob, starburst (paths in `draw/shapes.ts`).
- **Frames** (`photo/frames.ts`, plain layers): phone, laptop, polaroid, ticket, 3-up strip, a colour block offset behind a photo, tilted white chip cards.
- **Backgrounds:** a blurred colour field (`field` layer: blobs, blur, grain), a glow (a field with one blob), a glass card (`glass` layer: blurs what is behind it, translucent fill, soft border, rounded, optional shadow).
- **Objects:** an image layer with `object` effects (soft contact shadow, floor reflection, glow), scale and rotation by the layer's own box; plus a `shadow` on image and shape layers.
- **Photo-aware text:** `photo/analyse.ts` reads a photo into a 12 by 15 grid of brightness and detail (cropped the way it will be drawn); `photo/zones.ts` picks the calmest band for the words and works out an overlay (or a plate) for the 4.5:1 contrast with a margin; the page chrome (handle strip, dots, page number) is protected the same way; `photo/repair.ts` is the safety net after drawing (stronger overlay under the words, then a whole-photo overlay, then plates). No face finding.
- **Photo slots in the script:** optional `photo` (the name of one of the person's photos) and `photo_hint` (at most 90 characters) per slide; the validator checks them, and both prompts (copied prompt and writer prompt) mention `photo_hint`. An empty slot draws a clean placeholder (a panel with a picture symbol, or a labelled frame) and the slide card gets a note; the plan's `meta.photoSlots` lists every slot (filled or not, hint, synthetic). It never fails a check.
- **Seven photo layouts** (`styles/layouts-c.ts`): `cover-photo-full`, `cover-photo-shape`, `cover-photo-split`, `content-photo-frame` (phone, laptop, polaroid, ticket, offset block, plain or glass), `content-photo-strip`, `stat-photo`, `quote-photo-blur`.
- **Three styles from references no stored style covered:** `mono-poster`, `film-paper`, `glass-gradient` (each a folder with `style.json` and an SVG asset where used). A style opts in with a `photo` block (named treatments, per-palette colour fields, glass look); a layout rule can ask `when: { photo: true }`.

### Results (Results screen, "Step 11: Photo side"; TEST ASSETS: not shippable)
- Treatment gallery: 37 plans, one per treatment, mask, frame, background and object effect, all on one of your photos (the objects use a labelled stand-in drawn in code).
- 3 styles x 2 photo decks x 7 slides = 42 slides with your photos, every slide its own PNG, plan, lint and phone-size copy. All 42 pass the eight phone-size checks. 4 of the 33 photo slides needed the safety net (a stronger overlay) after drawing; none ended failing.
- The same deck with no photos: the slides that asked for a photo draw placeholders and carry a warning; none fails.
- My verdicts: mono-poster **close**, glass-gradient **close**, film-paper **off** (reasons and lists in the Results screen and in `tests/image-engine/step11-findings.json`).

### What it could not do
No transparent pictures were supplied, so the 3D-object style was not built and nothing is cut out of a photo (no fake cutouts). The object effects are shown on a synthetic stand-in. Not reproduced: the brush-script and serif/handwriting fonts (not bundled), torn paper, tape, stickers, the window-shaped crop, a folder-shaped glass card, a thin light headline weight. The test photos are mostly places, not people, so the people-led looks of the references are untested.

### Weak
Mono-poster's cover and stat photos are dark (your test photos are dark and are crushed to black and white under an overlay). Film-paper has one film recipe for every photo. On the dark gradient slides the colour field is faint (stronger fields failed the contrast check against orange words). Words can still land on a face, since there is no face finding.

### Not tested
Only Chrome. Treatments use the canvas blur filter (older browsers lack it). The `photo_hint` rule in the writer prompt was never run with a real writer. In the app, the three new styles appear in the style picker and in Pick for me; with no photos a photo style shows its non-photo layouts, and placeholders only on slides that carry a hint. Pick for me was not re-measured. No performance measurement.

## Step 12: Photos in the app (Images > Make a carousel)

### What exists
- **A Photos strip** at the top of the editor: add photos (button or drop files), add transparent objects, see each picture's size and how many slides use it, drag one onto a slide, remove it. One plain sentence says the pictures stay in this browser and are never sent anywhere.
- **A photo slot on each slide card** whose layout has one (only in the three photo styles): add, replace, remove, drop a file or a photo from the strip, or choose from a list ("Use a photo…", the keyboard way). The slide's `photo_hint` shows as "Ideal photo: ...". Styles or layouts with no photo slot show no photo control.
- **Per photo, on each slide:** a treatment (the style's own look, none, black and white, duotone, halftone, grain, blur, tint) with a small live preview, a draggable crop point (arrow keys work too), a frame (on the frame layout) or a shape (on the cut-out cover). Every change is a patch with undo and redo.
- **An object slot:** a transparent PNG with size, turn, position and an effect (soft shadow, drop shadow, glow).
- **Storage:** IndexedDB in the browser (`photoStore.ts`): the original as added, and a working copy turned the right way up (EXIF) and at most 3000 px on the long side. Unreadable files, HEIC, files over 60 MB, pictures over 120 million pixels and empty files give plain messages and the rest of a batch still works. A photo that is small, or stretched past the existing "photo resolution for this crop" limit, is warned about. If the browser will not store a picture the person is told and the project keeps working until a refresh. A refresh brings the project back with its photos; "Start over" removes them from the browser too.
- **Export** (single PNG and zip) is the same drawing as the cards: photos are drawn at the slide's size from the working copy, so nothing is drawn below the slide size unless the original was smaller.
- **Platform cap:** choosing Instagram, LinkedIn, Facebook or X caps the slide count at 20, 20, 10 or 4, with the line "Capped at 4 for X". A script that is already longer is warned about, not cut.
- **Engine additions** (nothing removed): per-slide `photo` and `object` choices in `SlideOverride`, `photoSlots[].photo` in the plan's meta, `objects` in the composer options, and the safety net (`checkWithRepair`) is now used for every slide drawn in the app.

### Results (Photo tools > Photos in the app)
Seven screenshots of the flow with ten test pictures (drawn in the page, never your photos), timings on this computer (one run: ten photos added in about 2 s, a slide drawn again in about 0.1 to 0.2 s, a refresh to all seven slides drawn in about 4 s, the zip in about 0.2 s), and what is weak.

### Weak
An object is not placed in free space and can cover words. With five or more photos the last three are kept for the 3-up strip, so a photo there is not put on a slide by itself. Words are placed for the photo's first, centred crop. HEIC cannot be read. The browser may clear its storage.

### Not tested
Only Chrome; Safari and Firefox (EXIF and drag and drop), touch screens, real full storage (simulated by making the store fail), pictures over 100 million pixels (54 million tried), more than ten photos, and real photographs (the test pictures are drawn shapes; the private test photos were not used, by rule).

### Cleanup after Step 12
- **Shuffle elements** now always draws the slide's pictures differently from now when another arrangement exists (it tries random salts until one differs, `pickShuffleSalt`); when none does, the card says "No other pictures fit this slide." Tests seed `Math.random`; a test presses it 20 times.
- **Object placement:** an object with no place chosen goes into free space (`photo/objectPlace.ts`): off every text as laid out, off cards and plates, off a full photo's crop point when there is a choice, made smaller (down to 40%) if it must be. A new lint check, "Object stays off the words", fails when the object's box covers words. Moving the object by hand fixes its place; "Place automatically" gives it back. The box is the whole picture, transparent corners included, so the check is a little strict.
- **HEIC:** no MIT, Apache-2.0 or BSD reader exists (see `LICENSES-ASSETS.md`). A browser that decodes HEIC itself (Safari) is let through; the others show "This is an HEIC photo. Convert it to JPG or PNG, then add it again." beside the photo control.
- **Strip photos** say "kept for the 3-up strip (drag it onto a slide to use it there)" instead of "on 0 slides".
- **Photo layouts** are used only on slides that have a photo or a photo hint. A slide without either shows "This slide has no photo slot. Add a photo, and it switches to a photo layout." Where a style has no photo layout for that kind of slide, the card says so.

## Step 13: Thumbnails, version 2 (Images > Make a thumbnail)

**What it is.** A person adds a photo, points at the subject, gives a title (typed, or written through the same writer interface as the carousel script), picks a style (or "Pick for me") and gets 3 to 6 options, each drawn and checked at phone size. They pick one, edit title, stressed word, treatment and format, undo and redo, and export a PNG (1280×720 or 1080×1920) or a zip of every option. The project and its pictures are saved in the browser and come back after a refresh. Stills only: not frames of a video.

**References.** The folder `Reference thumbnails/` does not exist, so nothing was read from real thumbnails. The six looks are derived from stored carousel styles: Hot flat colour, Mono photo poster, Tech polish with a neon accent, Soft gradient and glass, Film photo and paper, Warm editorial collage. Quiet dark minimal was left out as too quiet for a thumbnail. Whether these match what creators post is not known.

**Engine** (`src/image-engine/thumbnail/v2/`; version 1 in `thumbnail/` is untouched):
- `spec.ts` and `styles/format.ts`: the `thumbnail` block of `style.json` (palette, title look plain/outline/marker/plate, treatment, layouts, block colour, scrim, glass, elements, field) with its own validation in plain sentences. Six styles carry one.
- `compose.ts`: six layouts (subject on one side and title on the other, big title over the photo, photo and colour block, object and title, number badge, before and after) for 16:9 and 9:16, built on the carousel toolbox (text, markers, treatments, glass, objects, elements). An option exists only when its inputs do: object-and-title needs an object, number badge needs a number in the title (it never makes one up), before-and-after needs a second photo.
- `subject.ts`: the subject is the person's pointer (or a guess from where the detail is: not detection). The photo is cropped, and for a full-bleed photo drawn up to 50% bigger and slid, so the subject lands where the layout wants it; the title takes the side with more free room; elements and objects stay off a circle round it.
- `check.ts` and `lint/thumbnail-lint.ts`: the nine v1 checks plus three: "Title stays off the subject", "Crop keeps the subject", "Elements and objects stay clear". Each has a deliberately bad variant that fails it (`thumbnails-v2-checks.spec.ts`).
- `src/thumbnail/titles.ts`: the title writer (prompt, parser, one retry). It keeps a title only if it has at most 4 words, its stressed word is in it, and every number in it is in the source text.

**App** (`src/thumbnail/`): `ThumbnailPage.tsx`, `doc.ts` (every change is a patch with undo and redo), `render.ts`, `useThumbProject.ts`. Photos reuse the Photos code (IndexedDB, EXIF, HEIC message, downscaling).

**Results.** New "Thumbnails (v2)": per style, every option as its own card with the checker's result and a verdict box (matches / close / off / wrong). The old Step 2 thumbnail results moved under Checks and tests > Older work.

**Weak.** The layouts are my invention; options can look generic. Photos of the wrong shape or size still fail the v1 crop, resolution and sharpness checks. (Fixed in the follow-up below: the Q in the film look was not swallowed by the outline but covered by the box of the next line.) With the subject guess unchecked by a person the title can land on the wrong thing.

**Not tested.** Video frames, Safari and Firefox, touch screens, a real writer (tests use a stand-in), more than two photos.

### Follow-up: letters that lose their shape
- **What was wrong.** In the film look "THE QUIET GENIUS" read "OUIET". My first guess (the outline swallows the Q's tail) was wrong: a test render shows the tail survives a 7% outline. The tail dropped into the lime box behind the next line, which is the same lime as the letters, so the two merged.
- **New check, "Letters keep their shape"** (13 checks now), measured on the drawn pixels: each line is drawn alone (same size and place, no outline, shadow or box) to find the pixels that are solidly the letters, one letter at a time. In the finished picture those pixels must still be the letters' colour (nothing drawn over them, at most 2% covered), and the ring 2 to 4 px outside each letter must not be the letter's own colour (at most 5% of one letter's edge; the letter's own outline does not count). The old film look (lime letters, tight lines, lime box) measures 15% and fails; every stored option measures 0 to 3%.
- **Fixes.** Titles with a stressed word are set with a line height of 1.16, so a box never reaches the letters of the line above (this alone cleared 31 options in five styles that touched). The film look is unchanged.
- **Glass tall split** redone: a rounded glass card over the photo with the title large inside it, instead of a block that filled the bottom of the picture.

## Step 14a: Style from references, with saved templates (Images > Styles > New style from references)

**What it does.** A person adds 1 to 10 reference images (a deck collage, a single slide, a thumbnail), chooses the target (carousels, thumbnails or both), names the style and presses "Read references". The code measures the pixels (shown as MEASURED), a reader (a model with vision) describes the look in our style vocabulary, the app draws the person's own content in that style next to each reference, refines up to three rounds, and shows how close it got and what it could not do. The result can be saved as a template that appears, tagged "Mine", in the style pickers of the carousel box and of Make a thumbnail. References stay on this device.

**Code** (`src/reference/`, `server/reference-reader.ts`):
- `measure.ts`: palette, background, text colour, contrast, margins, title size and place, text zones, empty space, and whether a photo looks black-and-white, high-contrast, blurred, halftone or two-colour. Heuristics, said so.
- `grid.ts`: finds a collage's grid, first by gutters, then by seams for slides set edge to edge. The screen shows the cells, the person ticks the ones to learn from, can say "it is a single image", or draw one rectangle.
- `reader.ts` + `spec.ts`: the ReferenceReader interface (like the script writer), the vocabulary built from the validator's own lists, prompts, answer parsing, the merge over a base style limited to the sections each "learn from" choice allows (Everything, Colours and type only, Layout only, Photo treatment only), clean-up of references that cannot hold (no assets, palette names, treatment names, ranges), and patches. The reader never writes code, SVG or drawing instructions. An answer that fails the style validator is retried once with the errors.
- `loop.ts` + `similarity.ts` + `closeness.ts`: the replication loop (up to 3 refinement rounds, every round kept, best round by measured similarity plus the reader's judgement, early stop), the person's feedback as patches, and the closeness panel (matched, approximated, extrapolated, missing; never "identical" or "perfect").
- `templates.ts`: templates in IndexedDB (style only, no reference pictures), export and import as a file, rename, duplicate, delete, and the registry the pickers read. A template for one format is offered only there and warns when used for the other. If storage fails the person is told and the templates stay in memory.
- Server: `/__reference` (Claude Code command line, dev only) and `/api/reference` (ANTHROPIC_API_KEY from the server's environment; off without it; never called in tests).

**The dev reader, exactly.** `claude -p --output-format json --no-session-persistence --tools Read --allowedTools Read --permission-mode dontAsk` in an empty temporary folder that holds only the images. It works: it reads the image files and answers in JSON (75 to 125 seconds and 4 to 7 calls for a full run; about 11 s for one plain question). Claude Code is found in `%APPDATA%\Claude\claude-code`.

**Real runs** (Results > Style from references): one deck of 12 slides (6 used), one deck of 9 (6 used), one slide on its own. There is no `Reference thumbnails/` folder, so no thumbnail group was run.

**Weak.** Colours come out close; layout, type and photos do not. Text places overlap the reference by 14 to 48% and the title is 31 to 52% of the reference's size at best. Photos, cut-outs and objects are absent. The reader left the base style's decorations on (tape, a bulb, a squiggle in one replica). Grid detection found the right grid on 5 of 11 collages. See Results for the ranked missing tools.

**Not tested.** Safari and Firefox, the API reader (no key), thumbnail references, more than 12 images, real full storage (simulated).

## Step 14b: raise replication quality

**Process fixes.** (1) The reader starts from a blank base (`src/reference/blank.ts`: plain white, no elements, no marks, no photo treatments), so nothing from another style leaks in. (2) The loop stops after the first round that does not beat the best by measured similarity and reader score, and the screen says which round was kept and why. (3) A reference that clearly shows a photo, person, device or object gets a photo slot and a photo layout in the sample (a built-in drawn landscape, or the person's photo); `test-assets/` is not used. (4) Values the toolbox cannot draw (radius, margin under 48, text under 32) are moved before drawing and listed in the closeness panel. (5) Grid detection re-measured on the 11 real collages: **10 of 11 right (was 6)**; gutters over soft backgrounds, evenly spaced chains, partial seams. Hand correction is kept. `GRID_REAL=1 npx playwright test -c tests/image-engine/playwright.config.ts reference-grid-real` repeats the measurement. (6) Speed: 42 to 74 s per run (was 75 to 125 s). Where it goes: the reader's first read 20 to 26 s, the reader looking at pairs 20 to 46 s, drawing and measuring 1 to 5 s, making pictures under 1 s. Cut by fewer rounds and smaller pictures (pairs 760 px, items 1000 px).

**Tools built.** Fonts: Space Mono, Instrument Serif Italic, Hanken Grotesk (light neo-grotesk), Bebas Neue, Caveat Brush (all SIL OFL, checked at upstream; Inter not used). Marks, drawn in code (`style.marks`, `styles/marks*.ts`): asterisk, sparkle, round and starburst badges, circular text, stamp, ticket, label, outline button, arrow, scribble circle, ribbon, tape, two-tone text; textures: dot grid, halftone field, stripes, grain, text rows. **Not built:** gradient text. Two-tone text is an extra block, it does not replace the layout's headline. **Weak point:** marks sit in fixed zones and are not placed away from the slide's words, so they can overlap text (seen on deck B).

**Report only: what it would take (ranked by value for effort).**
1. Mark placement that avoids text (small: reuse `boxesToAvoid`). Do first, it fixes a visible defect.
2. Device mockups (laptop, phone, card on a block): medium. Needs a code-drawn frame (rounded rect, bezel, stand) with a photo slot inside, plus a layout that places it and a reader vocabulary entry. Photos inside frames reuse the photo pipeline.
3. UI parts (cards, icon rows, boxed lists with markers): medium. `uiCard` already exists as a toolbox piece; needs a spec in `style.marks`-like form (`parts`), icon placement from the library, and text slots filled from the slide script.
4. Diagrams (venn, charts, flows): large. Needs a small chart/diagram vocabulary with data from the script; the reader cannot supply data from a picture reliably.
5. Person and object cut-outs from the reference: not buildable from a reference (we never reuse reference pixels); only the person's own cut-outs, which exist.

**Round 2 on the real reader** (same three references plus one new): measured similarity on the kept round 47 / 55 / 65 / 58% (was 46 / 60 / 59 / none), reader 52 / 38 / 45 / 30 out of 100. **No overall gain in closeness**, within the reader's run-to-run noise. Gains are in process (blank base, photo slots, kept-round explanation, time, grid detection), not in the look. Results screen: "Style from references (round 2)". Tests: `marks.spec.ts`, new cases in `reference-app.spec.ts`, `reference-grid-real.spec.ts` (opt-in), `reference-results-r2.spec.ts`.

## Step 14c: live view and speed

**Live view** (`src/live/`): a panel that opens by itself when a long job starts (style from references, one-shot carousel, thumbnail; a thumbnail's only if it takes over 1.5 s). It lists each stage with a status (waiting / running / done / skipped / failed) and its seconds, says "Waiting on the reader, N s" during a slow call, shows the reference beside the latest replica, keeps every round as a small clickable picture, and lists what was decided with each item marked MEASURED, READER, CLAMPED or REJECTED (with the reason). Cancel stops the job. A finished job shrinks to a bar (so it does not sit over the page) and opens again on click, with a "Where the time went" table. The job record (stage times, rounds, decisions, our pictures, never a reference) is kept in this browser and shown in Results under Style from references as "Latest run". **Replay edits** (carousel slide cards, thumbnail options): the plan is rebuilt with one `add` patch per layer through the existing patch system; play, pause, step forward, step back (the inverse patch), speed 0.25 to 8×. **Why this slide**: style, layout and the rule that matched, palette, every check, what the safety net changed, drawing notes.

**Speed.** Measured first (real reader, `REAL_LIVE=1`, `tests/image-engine/live-real.spec.ts`), see Results, "Live view and speed". The reader is about 85 to 90% of every style job (first read 18 to 37 s, each look at a round 8 to 22 s); drawing a round is 0.2 to 4 s. One-shot carousel 11.7 s (writer 10.3 s). Thumbnail 0.9 s. What helped: a quick draft from the measured numbers on screen after 0.5 to 1.8 s (before: nothing for 20 to 37 s); the cache of the first read (37 s to 0 s when the same pictures, learn-from choices, target, base and reader version come again; Clear cache button; the cache holds the reader's answer and a hash, never a picture; a cache that cannot be opened is skipped after 2 s). What did not help: smaller pictures (900/1100, 760/1000 and 560/720 px took the same time within the noise, and the result did not visibly drop at the smallest size on two references; default kept at 760/1000). Parallel reader calls: the loop's looks depend on each other, so only the quick draft runs alongside the first read (said in the panel). Still slow: each reader call starts a new Claude Code process; fix for later: keep one process alive between calls or use the API reader (an estimate of a third to a half, untried).

**Also fixed:** the app looked for the Claude Code command line only in the old desktop-app folder and on the PATH, so the real reader could look unavailable; it now also looks in `~/.local/bin`. A test race in `carousel-app` (a passing "Drawing…" note in the style button) was fixed.

**Not done / untested:** the Live view for one-shot and thumbnail jobs shows stages only (no pictures); the cancel path of the one-shot and thumbnail jobs is tested only for the style job; Replay of a plan with many layers (marks, textures) is slow at 1× by design.
