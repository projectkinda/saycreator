# Image engine status

Last updated: after Step 2 of 6. Contract: `IMAGE_CONTRACT.md`. Licences: `LICENSES-MODELS.md`.

## Read this first

- Step 1 outputs use a **synthetic drawing** (`public/test-assets/synthetic-photo.svg`, labelled as such).
- Step 2 outputs use **your 8 images in `test-images/`**. They are finished artwork and film stills (posters, anime frames, one dark render, one phone snapshot), **not video frames**. Two carry baked-in watermarks or text. Nothing here says how thumbnails will look on real **video frames**, which are softer, more compressed and often lower resolution, and which will contain a person moving, not a posed shot. Frame mining from video is deferred (Step 6).
- Titles for the test images were written by me (`tests/image-engine/thumbnail-cases.json`); one is five words on purpose.

## Steps

| Step | What | State |
|---|---|---|
| 1 | Plan, patcher, Fabric, fonts | **Done, see below** |
| 2 | Thumbnail composer and phone-size checker | **Done, see "Step 2" below** |
| 3 | Carousel and quote cards (7 slides, lint) | Not started |
| 4 | Background removal (ISNet, BiRefNet_lite), `/lab` page | Not started |
| 5 | Hook into the app behind the mock engine's names | Not started |
| 6 | Frame mining from video | **Deferred, not tested.** Waits until you say the video engine can supply clips |

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
npm run test:image      # 34 tests in real Chrome, writes out/image-engine/ (Step 2 reads test-images/)
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

## Next (waiting for your go-ahead)

Step 3: carousel and quote cards (7-slide carousel from a script, quote cards, their own checks). No new images are needed.
