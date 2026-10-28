TEST DATA: Crello, not shippable until licences are checked.

crello/layouts.json holds layouts DERIVED from the cyberagent/crello dataset (CDLA-Permissive-2.0; the templates come from VistaCreate, whose terms also apply): boxes in percent of the canvas, roles, sizes, colours and short keywords. It holds no preview picture, no element picture and no template text.

Make it:  npm run crello:fetch   then   npm run crello:build

This folder is gitignored, never bundled, and never referenced from src/, public/ or dist/. npm run check:test-assets (the first step of npm run build) fails if its files, or anything marked with the data's sentinel, turn up in a build.
