Private test assets.

Drop any images you like here (PNG with transparency works best for stickers and cut-outs; name them for what they are, for example arrow-1.png, star.png, doodle-3.png, so tests can match them to a style rule).

This folder is gitignored, never bundled, never referenced by a stored style or an export. Slides rendered with it are labelled "TEST ASSETS: not shippable" in the Results screen. npm run check:test-assets (part of npm run build) fails if anything in src/, public/ or dist/ refers to it or contains a copy of a file from it.
