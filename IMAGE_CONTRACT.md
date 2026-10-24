# Image engine contract (Step 1 draft)

Lives in `src/image-engine/`. Framework-free TypeScript, no React. The video engine is separate and untouched.

**Core rule.** An LLM may write a *plan* (JSON). It never touches pixels. Deterministic code renders the plan. A prompt edit and a manual edit are the same thing: a **validated patch** applied to the plan. The plan JSON is the only saved format (Fabric's own serialization is never saved).

## Plan

```ts
Plan {
  schema: 1
  revision: number                // starts at 1, +1 for every applied patch (undo and redo included)
  canvas: { width, height, background }   // final size in px, whole numbers
  layers: Layer[]                 // back to front, unique ids
}
```

Every layer has: `id`, `kind`, `x`, `y`, `width`, `height` (the box, top-left origin), `rotation` (degrees, about the box centre), `opacity` (0 to 1), optional `visible`, `name`, `mask`, `filters`.

| kind | extra fields |
|---|---|
| `image` | `src` (URL), `fit` (`cover` or `contain`), `focal {x,y}` (0 to 1, where `cover` keeps the crop centred) |
| `text` | `text`, `style {font, weight, size, color, align, valign?, lineHeight, stroke?, shadow?}`, `autoFit {minSize}?`, `highlight {words[], color, textColor?, paddingX, paddingY, radius}?` |
| `shape` | `shape` (`rect` or `ellipse`), `fill`, `stroke?`, `radius` (rect corners) |

- `mask`: `{shape: rect | roundRect | ellipse, radius?}`. Clips the layer to its box.
- `filters` (image layers only): `brightness` -1..1, `contrast` -1..1, `saturation` -1..1, `blur` 0..40.
- Fonts: only `Schibsted Grotesk` and `Instrument Sans`, bundled, never fetched.

## Patch

```ts
Patch { baseRevision: number, label: string, ops: Op[] }
Op =
  | { op: 'add',    layer: Layer, index?: number }
  | { op: 'set',    id: string, path: string, value: unknown }   // id 'canvas' edits the canvas; value undefined deletes the key
  | { op: 'remove', id: string }
  | { op: 'move',   id: string, toIndex: number }
```

- `baseRevision` must equal the plan's current revision, otherwise the patch is rejected ("made on an older version").
- Validated first, applied **atomically** (all ops or none). The *resulting* plan is validated in full.
- Rejections carry plain-language reasons, never codes alone.
- Every applied patch returns its **inverse patch**. Undo and redo apply inverse patches; History keeps labels.
- Selection and transform events from the canvas **emit patch proposals** (`onPatchRequest`). They never change state.

## Inputs (filled in from Step 2 on)

Brand kit (colours, headline and body font, logo, handle). Thumbnail request (source image, title up to about 4 words, layout, 16:9 or 9:16; the source is a plain image for now, later a mined video frame). Carousel script (slides with headline, optional body, optional highlight word; 4:5). Quote (text, attribution; 1:1).

## Outputs

PNG `Blob` at final size: 1280x720 (16:9 thumbnail), 1080x1920 (9:16), 1080x1350 (4:5), 1080x1080 (1:1). Alongside it a JSON result:

```ts
RenderReport { ok: boolean, warnings: {layerId, code, message}[], lint?: LintResult[] }   // lint arrives in Step 2
```

## CanvasAdapter (thin, replaceable)

```ts
mount(el | null)                         // null = off screen
render(plan)            -> RenderReport  // waits for fonts and images
applyPatch(patch)       -> PatchResult   // validate, apply, re-render
export({format, scale}) -> Blob
onPatchRequest(handler) / onSelect(handler)
dispose()
```

Fabric.js is the first implementation. Nothing outside `fabric-adapter.ts` imports Fabric.
