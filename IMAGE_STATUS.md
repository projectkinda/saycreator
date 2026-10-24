# Image engine status

Last updated: after Step 1 of 6. Contract: `IMAGE_CONTRACT.md`. Licences: `LICENSES-MODELS.md`.

## Read this first

Every picture so far is drawn from **synthetic or hand-written test input**. There is no photo and no video frame in any output. `public/test-assets/synthetic-photo.svg` is a drawing with the words "SYNTHETIC TEST IMAGE, NOT A PHOTO" on it. Nothing here says anything about how thumbnails will look on real photos, and even less about real **video frames**, which are softer, more compressed and often lower resolution. Frame mining from video is deferred (Step 6).

## Steps

| Step | What | State |
|---|---|---|
| 1 | Plan, patcher, Fabric, fonts | **Done, see below** |
| 2 | Thumbnail composer and phone-size checker | Not started |
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

## How to run

```bash
npm install
npm run test:image      # 21 tests in real Chrome, writes out/image-engine/
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

Step 2: thumbnail composer and phone-size checker. I need your `test-images/` photos for that (8 to 10, some deliberately poor). Until then I can only use the synthetic image, which would prove nothing about the checks.
