# Style format

A **style** is a folder under `src/image-engine/styles/<name>/`:

```
src/image-engine/styles/hot-flat/
  style.json        the look: colours, fonts, sizes, shapes, spacing, and which layouts to use
  assets/           small SVG graphics the style uses (an asterisk, an arrow, a flower...)
```

**Adding a style is adding a folder.** No code changes. The engine finds every `*/style.json` in that directory when it starts. A folder that does not pass the checks below is *not loaded*, and the reason is shown in plain words (in the test output and wherever styles are listed). Copy an existing folder, rename it, edit the JSON, done.

Only the bundled fonts can be used (Schibsted Grotesk 600, 700, 800 and Instrument Sans 400, 500, 600). Nothing is loaded from the network.

## style.json

```jsonc
{
  "schema": 1,
  "name": "hot-flat",              // must equal the folder name
  "title": "Hot flat colour, heavy type",
  "description": "Loud and high-energy: bold claims and short punchy tips.",   // one line (10 to 140 characters): what the style is for. Shown to the writer.
  "suits": { "tones": ["bold"], "keywords": ["launch", "growth"], "slideTypes": ["step"] },   // optional: what "Pick for me" looks for (tones: clear, bold, friendly, expert)
  "version": "1.0.0",
  "basedOn": { "cluster": "hot-flat", "note": "Which reading this came from, in a sentence." },

  "palettes": {                    // any names you like; every palette needs all 10 colours
    "dark":  { "bg": "#141311", "text": "#FDFDF7", "muted": "#B9B8AE", "accent": "#DCF922",
               "onAccent": "#141311", "marker": "#DCF922", "onMarker": "#141311",
               "surface": "#262521", "onSurface": "#FDFDF7", "line": "#FDFDF7" }
  },
  "rhythm": ["hot", "dark", "light"],   // palette names, used in turn from slide to slide
  "byType": { "cover": "hot" },         // optional: a palette for one slide type, whatever the rhythm says

  "fonts": { "headline": "Schibsted Grotesk", "headlineWeight": 800,
             "body": "Instrument Sans", "bodyWeight": 500, "strong": 600 },
  "type": { "cover": 150, "headline": 104, "body": 44, "small": 34, "stat": 340, "quote": 80, "label": 32,
            "note": 40, "byline": 38 },   // note and byline are optional: the line under a big number (default body - 4) and the name under a quote (default body - 6)
  "caseStyle": "upper",            // upper, lower or sentence
  "headlineLineHeight": 0.95,      // 0.8 to 1.6. Under 1.1 the highlight bars hug each line
  "bodyLineHeight": 1.3,           // optional, 1.0 to 2.0 (default 1.3). Open it up to keep small type airy
  "shape": { "radius": 0, "outline": 4, "stroke": 8, "badge": "square", "marker": "box",
             "sticker": "burst", "hardShadow": 10, "decor": "blocks" },
  "spacing": { "margin": 80, "gap": 24, "section": 52 },
  "chrome": "strip",               // dots-swipe, page-number, strip or none

  "layouts": { ... },              // see below
  "assets": { "asterisk": "assets/asterisk.svg" },

  "knownLintConflicts": [ "Sentences about where this style breaks our phone-size rules." ],
  "notReproduced": [ "Sentences about what the reference had that this style does not do." ]
}
```

### Colours (palette roles)

| role | used for |
|---|---|
| `bg` | the slide background. A colour (`#RRGGBB`) or a gradient `{"type":"linear","angle":160,"stops":[{"at":0,"color":"#..."},{"at":1,"color":"#..."}]}` |
| `text` | headlines and body text |
| `muted` | secondary text, small labels |
| `accent` | numbers, buttons, icons. Also used as text, so it should reach 4.5:1 on `bg` |
| `onAccent` | text on top of an `accent` shape |
| `marker` / `onMarker` | the highlight bar behind a word, and the text on it |
| `surface` / `onSurface` | cards and panels, and the text on them |
| `line` | outlines and rules |

If a pair is under 4.5:1 (text on background, muted on background, text on accent, text on marker) the style still loads, with a **warning**, because the checker will fail those words. Writing the number down is better than hiding it.

### Sizes (px on the 1080 wide slide)

Every text size is checked against the phone minimum of 32 px when the style is loaded: `type.cover`, `headline`, `body`, `small`, `stat`, `quote`, `label`, `note` and `byline`. When `note` or `byline` are left out, the value that will really be used (body - 4, body - 6) is the one checked. A size under 32 loads with a warning in plain words that names what will fail (for example "body text will fail the size check on every slide that has them"), and the carousel style picker marks the style. Raise the size, or keep it on purpose and say so under `knownLintConflicts`. If a style needs small type to stay airy, open `bodyLineHeight` instead of going under 32 (the Quiet dark style does this: everything is 32 px and body text is set at 1.5).

### shape

`badge`: circle, rounded, square. `marker`: box (a filled bar), underline, brush. `sticker`: pill, tag, burst. `decor`: rings, orbs, blocks. `radius`, `outline`, `stroke`, `hardShadow` are in px (`hardShadow` is the offset of a solid shadow under cards; 0 = none).

### layouts

For every slide type (`cover`, `content`, `step`, `stat`, `checklist`, `beforeafter`, `quote`, `closing`) give a list of rules. **At least 2 rules using at least 2 different layouts**, and the last rule has no `when`, so every slide gets a layout.

```jsonc
"cover": [
  { "use": "cover-stack", "when": { "headlineWordsMax": 7 },
    "params": { "bar": "last", "asset": "asterisk", "assetSize": 200, "kicker": "sticker" } },
  { "use": "cover-top",   "params": { "bar": "all", "visual": "asset", "asset": "arrow-ne" } }
]
```

The first rule whose `when` holds is used. `when` can use: `indexMin`, `indexMax` (position in the deck, counted from 0), `headlineWordsMin/Max`, `bodyWordsMin/Max`, `itemsMin/Max` (checklist), `valueCharsMax` (stat number), `quoteCharsMin`, and `occurrence` (`"odd"` or `"even"`: the 1st, 3rd... or 2nd, 4th... slide of that type). A rule may also set `"palette"` to use a different palette for that layout.

**Layouts you can name:**

| slide type | layouts |
|---|---|
| cover | `cover-stack` (headline fills the slide and sits low), `cover-top` (headline at the top, a visual below), `cover-centre` (centred, a mark above, a button below) |
| content | `content-stack` (heading, rule, body), `content-bar` (heading on solid bars, body below), `content-columns` (heading on top, narrow body at the foot) |
| step | `step-badge` (numbered badge), `step-numeral` (huge number), `step-pill` (outlined "STEP 01" pill) |
| stat | `stat-giant` (huge number), `stat-card` (number in a card) |
| checklist | `checklist-icons` (round ticks), `checklist-lines` (numbered rows between rules) |
| beforeafter | `ba-split` (two halves), `ba-cards` (two cards) |
| quote | `quote-marks` (big marks, text at the left), `quote-centre` (everything centred) |
| closing | `closing-button` (button and handle), `closing-bar` (full-width bar at the foot) |

**Params** (all optional): `bar` (`last`, `all`, `none`: solid bars behind the last line or every line of the headline), `asset` (an asset name), `assetSize` (px), `kicker` (`sticker`, `pill` or `label`), `prefix` (text before a label, for example `"// "`), `visual` (`ui-card`, `glow`, `asset`, `none`; cover-top), `chart` (`bars` or `line`), `button` (true: a round arrow button), `headlineShare` (0 to 1: how much of the room the cover-top headline may use), `numeralSize`, `ghost` (true: the step number in the muted colour), `badgeSize`, `ruleWidth`, `pill` (true: an outlined arrow pill on the stat), `alt` (the palette used for the second half of a split).

## elements (optional): illustrative elements

A style with no `elements` block never gets any. With one, the engine places library elements (icons, doodles, stickers, tape, objects, textures) on finished slides, in free space only: never over text, content or the style's own decoration. The same slide always gets the same placement.

```jsonc
"elements": {
  "density": { "min": 2, "max": 4 },            // elements per slide
  "gap": 30,                                    // px kept clear around text and content
  "types": ["cover", "content", "step"],        // optional: slide types that get elements (others get none)
  "sticker": { "color": "bg", "width": 8 },     // optional: the outline used by rules with "sticker": true (a palette role)
  "rules": [
    { "tags": ["arrow"], "kinds": ["code"], "zone": "near-headline", "count": [0, 1], "size": [150, 250], "rotate": [-18, 12] },
    { "tags": ["star", "heart"], "kinds": ["object"], "colour": "original", "zone": "free", "count": [1, 2], "size": [120, 210], "sticker": true, "shadow": true },
    { "tags": ["halftone"], "zone": "texture", "count": [0, 1], "size": [420, 560], "opacity": 0.3 }
  ]
}
```

Rule fields: `tags` (any of these; the library's tags are listed on the Results screen), `kinds` (`icon`, `object`, `code`), `zone` (`free`, `near-headline`, `corner-tl`, `corner-tr`, `corner-bl`, `corner-br`, `bleed-top`, `bleed-bottom`, `bleed-right`, `texture`), `count` [fewest, most] from 0 to 4, `size` [smallest, largest] in px, `rotate` [from, to] degrees, `opacity`, `match` (`"slide"`: pick only elements linked to the slide's `element_tags`, or none; see below), `tint` (one palette role: flat colour), `recolour` (swap palette roles), `recolourBy` (the same, per palette name, for example `{"hot": {"accent": "bg"}}`; it wins over `recolour` for that palette), `colour` (`original` keeps the element's own colours, `palette` recolours it; default: original for coloured objects, palette for everything else), `sticker` (outline from the `sticker` block), `shadow`.

**Decoration needs a job.** A rule whose tags are all plain decoration (blob, doodle, squiggle, zigzag, brush, loop, circle, underline, halftone, tape, arrow, plus, asterisk, sparkle, burst...) must say what it is for with `"role"`, or the style is refused: `"frame"` (a ring round the big number of a stat slide, or a line under the headline), `"point"` (an arrow in the real gap under the headline, turned to point down at what follows), `"gap"` (fills real empty space: only on a slide that is not already full, with extra clear space around it). Decoration is never placed on text, except a frame on the text it frames. If a rule cannot find its job on a slide (no big number, no gap), nothing is placed and a note says why. A ring round a number is supported but no stat layout leaves room for one, so no style uses it.

**Keeping the split clear.** A layout that splits the slide in two (myth and fact) tells the placer where: `plan.meta.keepClear` lists a band across the split and a box round its arrow button. No picture is placed there, and the phone-size check "Elements stay off the split" fails if one is. This is built into the two myth and fact layouts, not set per style.

**Following the slide.** A slide in a script can carry `"element_tags": ["money", "growth"]` (2 to 4 lower-case words; the concept words are listed in `src/image-engine/styles/tags.ts`). Rules with `"match": "slide"` then use only elements whose tags link to those tags, best link first, never the same picture twice, and place nothing when none links. Other rules that pick among their own tags also skip any picture of a thing that does not link to the slide. Plain decoration (arrows, squiggles, tape, blobs) is never judged. The plan records the tags in `meta.elementTags`, and the phone-size checks gain an eighth check, "Elements match the slide", which flags an "unrelated element". A script with no `element_tags` behaves as before.

Plain-language problems: a bad zone, count, tint or colour is an error that says what is allowed. A rule whose tags match nothing in the library is a warning ("places nothing"), not an error.

## assets/*.svg

Small SVG files, drawn with a limited set of shapes so the engine can turn them into the same layers as everything else (and so they take the style's colours):

- `viewBox` is required and must start at `0 0` (for example `viewBox="0 0 100 100"`).
- Allowed elements: `path` (**absolute** commands `M L C Q H V Z` only, no arcs, no lower-case), `line`, `polyline`, `polygon`, `rect` (no rounded corners), `circle`, `ellipse`.
- `fill` and `stroke` are **palette role names** (`accent`, `text`, `muted`, `bg`, ...) or `none`. Never a hex colour. That is what lets one graphic work in every palette.
- `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `opacity` work. Nothing else (no gradients, filters, text, images, transforms).

List each file in `"assets"` under a short name, and use that name in a layout rule's `params`.

## What gets rejected, and what you will read

Every message is a sentence. Examples: `Style "hot-flat": "name" is "hotflat" but the folder is called "hot-flat". They must match.` ·
`palette "dark" has no "accent" colour.` · `fonts.headlineWeight is 900, but Schibsted Grotesk is bundled only in weights 600, 700, 800.` ·
`layouts.step has 1 rule. A style needs at least 2 distinct layouts for every slide type.` ·
`The last rule of layouts.cover has a "when", so a slide that matches no rule would have no layout.` ·
`Asset "x": a <path> uses commands other than M L C Q H V Z in capital letters.` ·
`Asset "x": a <circle> has fill="#FF0000". Use a colour name from the palette ... so the graphic takes the style's colours.`

## Trying a style

`npm run test:image` draws every style with every sample script (and three quote cards) into `out/image-engine/style-recreation/<style>/<script>/slide-01.png` ... one file per slide, each with its own `.plan.json` (the slide as a plan, editable by patches) and `.lint.json` (the phone-size result, which layout was used and why). The Results screen shows them.
