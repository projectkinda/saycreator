# Licences: models, libraries and fonts used by the image engine

Rule: only permissive licences (MIT, Apache-2.0, BSD, SIL OFL for fonts). No AGPL, GPL, LGPL, non-commercial or "research only" code or weights. Every entry was checked against the **upstream repository**, not a mirror's or a registry's claim.

## Models

None yet. ISNet and BiRefNet_lite arrive in Step 4 and will be recorded here with source, licence, file size and anything unclear **before** they are added.

## Libraries added in Step 1

| Package | Version | Licence | Checked at (upstream) | Why |
|---|---|---|---|---|
| fabric | 7.4.0 | MIT | `fabricjs/fabric.js` LICENSE (MIT, Printio and Fabric.js contributors) | Drawing, behind `CanvasAdapter` so it can be replaced |
| @playwright/test | 1.64.1 | Apache-2.0 | `microsoft/playwright` LICENSE (Apache 2.0) | Runs the tests in real Chrome. Dev only. No browser download: it uses the installed Chrome |
| @types/node | 26.6.5 | MIT | DefinitelyTyped | Types for the test files. Dev only |

No dependency fetches anything from the network at runtime.

## Fonts (bundled in `src/image-engine/fonts/`, never loaded from the network)

| Font | Licence | Upstream source of the licence text | Files and sizes | Notes |
|---|---|---|---|---|
| Schibsted Grotesk | SIL Open Font License 1.1 | `google/fonts` `ofl/schibstedgrotesk/OFL.txt`, copyright 2023 The Schibsted-Grotesk Project Authors | 600, 700, 800 woff2: 25.2 KB each | No Reserved Font Name is declared in the copyright line |
| Instrument Sans | SIL Open Font License 1.1 | `google/fonts` `ofl/instrumentsans/OFL.txt`, copyright 2022 The Instrument Sans Project Authors | 400, 500, 600 woff2: 16.9 to 17.4 KB each | No Reserved Font Name is declared in the copyright line |

Where the font files came from: the `@fontsource/schibsted-grotesk` and `@fontsource/instrument-sans` npm packages (used only to download the files; they are **not** dependencies). Fontsource ships the upstream fonts converted to woff2 and cut down to the Latin character range.

**Unclear or to watch**
- The fontsource files are the upstream fonts subsetted by a third party. The OFL allows that, and the upstream OFL text is shipped next to the files, but I did not diff the glyph outlines against the upstream TTFs.
- Latin subset only. Cyrillic, Greek, Vietnamese and most symbols (including the right arrow →) fall back to a system font. If a brand needs them, add the `latin-ext` or other subsets from the same packages.
