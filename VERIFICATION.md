# Verification

Verified locally on 2026-09-12.

- Production build: passes; initial JS is about 91 kB gzip. Map and PDF libraries load separately.
- TypeScript and explicit ESLint (zero warnings): pass.
- Jest: 11 passing tests across geometry, UI workflow, and saved irregular-project regression.
- Geometry: concave property containment; exclusion holes and overlapping exclusions; crossing/bent road corridors; pairwise lot non-overlap; measured frontage; split/merge area conservation; invalid edit rejection; malformed project rejection.
- Browser: Chromium at desktop and 390 × 844 phone viewport. App loads, sample generation works, amber constraints are visible, split creates two half-acreage lots, Undo restores the original, and reload restores IndexedDB state.
- Input: uploaded a generated test PDF, rendered page 1, drew six points using six mouse taps on the phone-sized canvas, finished the shape, calibrated it to 42.2 acres. Imported the downloaded project file with all lots restored.
- Maps: loaded OpenStreetMap tiles, used the current map view, and verified the resulting canvas has a scale set. Actual device geolocation was not requested.
- Exports: downloaded PNG, PDF, CSV and JSON project. Visually inspected the PNG; PDF download includes the drawing and lot schedule.
- Browser reported no application errors on the successful workflows. An initial relative-path test upload failed because the browser could not read that test path; using the absolute fixture path passed.

Physical iOS/Android hardware and local subdivision regulations are not validated. Map service availability depends on the user's network and OpenStreetMap. Production deployment is verified separately from these local checks.

Vercel initially rejected an import-order lint error that the inherited local build settings did not surface. Imports were corrected and an explicit `npm run lint` check was added.
