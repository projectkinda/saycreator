# Licences: asset library (icons, objects, doodles)

Rule: only permissive licences (MIT, Apache-2.0, ISC, CC0 or similar), checked at the **upstream repository**, not a mirror's claim. Any pack with a condition that is unclear (attribution, share-alike, no-redistribution, no-commercial) is **not used** and is listed under "Not used" so you can decide.

`npm run fetch:assets` downloads the packs (pinned version, sha512 integrity checked against the pinned value, nothing written if it does not match). Fetched files go to `src/image-engine/assets/packs/` and are gitignored: they are fetched at build time, never committed, and nothing is requested while the app runs. `npm run check:licenses` fails if a pack in `scripts/assets.manifest.json` has a licence that is not on the permissive list, if this file does not describe a pack, or if fetched files do not match the manifest.

## Packs in use

| Pack ids | Source (pinned) | Licence | Upstream licence text | Elements |
|---|---|---|---|---|
| `lucide` | npm `lucide-static` **1.61.0** (`sha512-yLAiQB3M…GrA==`), upstream `lucide-icons/lucide` | **ISC** (plus MIT for a few icons derived from Feather, same file) | https://github.com/lucide-icons/lucide/blob/main/LICENSE | 2,171 outline icons |
| `phosphor-bold`, `phosphor-fill` | npm `@phosphor-icons/core` **2.1.1** (`sha512-v4ARvrip…ZilxQ==`), upstream `phosphor-icons/core` | **MIT** | https://github.com/phosphor-icons/core/blob/main/LICENSE | 1,512 bold + 1,512 filled icons |
| `fluent` | npm `@iconify-json/fluent-emoji-flat` **1.2.6** (`sha512-RY47RgPb…lUw==`), upstream `microsoft/fluentui-emoji` | **MIT** (Microsoft Corporation) | https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE (copy kept in `scripts/licences/`) | 1,579 coloured flat objects (skin-tone variants and flags left out) |
| `code` | drawn in `src/image-engine/assets/code-elements.ts` | ours, no third-party material | n/a | 52 listed variants of 24 shapes: blobs, squiggles, hand-drawn arrows and circles, starbursts, halftone, grain, brush strokes, tape, torn paper, label stickers, simple objects |

**Attribution needs (all three fetched packs):** MIT and ISC require that the copyright and permission notice travels with copies of the files. The fetch script copies each pack's licence text next to its files (`packs/LICENSE-<source>.txt`). If a product ever ships these files (for example inside an app bundle), the notice must be shipped with them. No visible credit on a slide is required by any of these licences.

**How the upstream licence was checked:** the licence file was read at the upstream GitHub repository (links above) on 2026-10-25 and compared with the licence the npm package declares. They agree for all three. For `fluent` the npm package is Iconify's repackaging; its `info.json` also says MIT and points at the same upstream licence.

**Unclear or to watch**
- `fluent` is a set of emoji-style pictures of objects (rockets, trophies, light bulbs). Its licence is plain MIT. MIT covers copyright; it says nothing about trademarks, and I did not look for any trademark claim on individual emoji. Not a licence problem as far as the licence text goes; you may still want to decide whether emoji-style art suits the brands you serve.
- Icons from `lucide` and `phosphor` are monochrome line or fill shapes. Recolouring and stretching are allowed by both licences (modification is permitted).
- The `code` elements are ours. Their shapes are generic (circles, waves, arrows); I did not copy any reference picture's drawing.

## Not used (so you can decide)

| Candidate | Why not |
|---|---|
| Open Doodles (Pablo Stanley, stated CC0) | The official source is a website download and a Figma file. There is no versioned, checksummable archive at an upstream repository, so the licence and the files cannot be pinned. Not used. If you want it, tell me and supply the download. |
| Twemoji | CC BY 4.0 (graphics): attribution is a condition. Not used. |
| OpenMoji | CC BY-SA 4.0: attribution and share-alike. Not used. |
| Noto emoji (Google) | The repository carries more than one licence (code, fonts and images differ). Unclear, not used. |
| HEIC readers for the browser (checked 27 Oct 2026) | **heic2any** (npm, labelled MIT, no dependencies): its 1.36 MB `dist/heic2any.js` has libheif compiled into it and the package carries no libheif or LGPL notice, so the MIT label does not cover what is inside. **libheif-js** (npm 1.23.5, 9 MB unpacked) is labelled LGPL-3.0. **heic-decode** and **heic-convert** (ISC) only wrap libheif-js. **libheif** itself (upstream `COPYING`): the library is under the GNU Lesser General Public License; only its sample programs and wrappers are MIT. No MIT, Apache-2.0 or BSD reader was found, so none is bundled. Safari and any browser that can decode HEIC itself are let through; the others show "This is an HEIC photo. Convert it to JPG or PNG, then add it again." |
| unDraw, Humaaans-style illustration sets, Streamline, Flaticon | Custom or no-redistribution licences. Not used. |

## Your own test assets (not a pack, not shippable)

`test-assets/` (at the repository root) is private. It is gitignored, never bundled, and never referenced by a stored style or an export. Slides rendered with it are labelled **TEST ASSETS: not shippable**. `npm run check:test-assets` (part of `npm run build`) fails if any file in `src/`, `public/` or `dist/` references it or contains a copy of one of its files. Note: `public/test-assets/` is a different, older folder (the synthetic drawings from Step 1) and is unrelated.

## Crello layouts (TEST DATA: not shippable until licences are checked)

`test-data/crello/layouts.json` (gitignored) holds layouts DERIVED from the Hugging Face dataset `cyberagent/crello` (CDLA-Permissive-2.0; the templates come from VistaCreate, whose terms also apply, and have not been read in full): boxes in percent of the canvas at the template's own shape, text roles by rank, sizes as a fraction of the height, colours, and up to twelve short keywords. It holds **no preview picture, no element picture, no template text (only the text's length, used while deriving) and no template title**. It is made by `npm run crello:fetch` (reads the metadata columns of the Parquet files by range request; the picture columns are never requested; the intermediate file goes to the system temp folder) and `npm run crello:build`. It is served to the Images > Layouts screen only by the development server (`/__layouts/crello`, `apply: 'serve'`), so a production build has no such address.

Guard (`npm run check:test-assets`, first step of `npm run build`): fails if anything in `src/`, `public/` or `dist/` mentions `test-data`, has the same name or bytes as a file in it, carries the data's marker (`CRELLO-TEST-DATA-SENTINEL-…`), or has "crello" in its file name under `public/` or `dist/`; and fails if `test-data/crello/` holds anything but `layouts.json`, or that file has a preview, image, text or link key, a long text, or has lost its "TEST DATA: Crello, not shippable until licences are checked" label. Before anything from it ships, the VistaCreate terms and the dataset licence must be read for this use; until then it is for looking at layouts only.

## Fonts (bundled, never loaded from the network)

Rule: SIL Open Font License 1.1 only, read at the **upstream source** (the `google/fonts` repository `ofl/<family>/OFL.txt`, which names each family's own project) and compared with the licence the npm package `@fontsource/<family>` declares (OFL-1.1). The woff2 files are the Latin subset from those packages, with the OFL text from upstream next to them in `src/image-engine/fonts/<family>/OFL.txt`. No Reserved Font Name is declared by any of them. Checked 2026-10-27. `npm run check:licenses` fails if a font folder has no OFL text.

| Family | Weights bundled | Looks like | Copyright line (upstream OFL.txt) |
|---|---|---|---|
| Schibsted Grotesk | 600, 700, 800 | heavy grotesque headlines | (from before; OFL.txt in its folder) |
| Instrument Sans | 400, 500, 600 | plain humanist body text | (from before; OFL.txt in its folder) |
| Hanken Grotesk | 300, 500, 700 | light neo-grotesk | Copyright 2021 The Hanken Grotesk Project Authors (https://github.com/marcologous/hanken-grotesk) |
| Space Mono | 400, 700 | typewriter-style monospace | Copyright 2016 The Space Mono Project Authors (https://github.com/googlefonts/spacemono) |
| Instrument Serif Italic | 400 | high-contrast italic serif (the italic of Instrument Serif, registered as its own family) | Copyright 2022 The Instrument Serif Project Authors (https://github.com/Instrument/instrument-serif) |
| Bebas Neue | 400 | tall condensed all-caps display | Copyright © 2010 by Dharma Type. |
| Caveat Brush | 400 | hand-drawn brush script | Copyright 2015 Google Inc. All Rights Reserved. |

Not used: Inter (excluded on purpose). Permanent Marker is Apache-2.0 (permissive) but Caveat Brush already covers the brush look under OFL.
