# Lot Layout

A mobile-first conceptual parcel planner. Trace an irregular property, reserve exclusions and roads, generate lots, adjust the result, and export it. Runs entirely in the browser; no account, paid map key, or backend is required.

## Logan's skinny

1. **Find on map** (pan or enter latitude, longitude), or **Upload aerial / plat**. PDFs use page 1.
2. Tap **Property**, tap the corners, and **Finish shape**. For an upload, enter known acreage in **Land** and tap **Set**, or calibrate with two known points and their distance.
3. Tap **Avoid** to outline ponds, easements, or unusable ground. Finish each shape.
4. In **Lots**, enter lot acreage, minimum frontage, and road width. Tap **Road**, mark its start/bends/end, and **Finish shape**.
5. Tap **Generate lots**. Amber lots need review; unused land is reported separately.
6. **Select** a lot and drag its corners, or use the lot panel to rename, split, merge with a neighbor, or delete. **Undo** recovers changes. Use **Pan**, pinch, or +/− to navigate.
7. **Export** PNG/PDF, a CSV lot table, or a **project file** to keep editing on another device.

Your current project autosaves in this browser. Wait for “Saved on this device” before closing. Save a project file before clearing browser data or starting another property. Changing land, road, scale, or lot rules clears generated lots; Undo restores them. These are concepts, not approved plats.

## Run and validate

```sh
npm ci
npm start
npm run lint
CI=true npm test -- --watchAll=false --runInBand
npm run build
```

The existing Create React App/Vercel build contract is retained (`build/`). Prestart/prebuild copy the matching PDF.js worker to `public/`; the worker is generated, not tracked. The lockfile pins dependency resolution. No `.env` is required. A previously tracked `.env` is removed from tracking and ignored; existing git history is not rewritten.

## Architecture and implementation phases

1. **Geometry and project model:** `src/planner/model.ts`, `geometry.ts`, `storage.ts`. Versioned project state uses image-space coordinates and explicit feet-per-pixel calibration. Polygon clipping implements full containment, unioned exclusions, rounded polyline road right-of-way, overlap prevention, actual acreage, shared-edge frontage, splitting, merging, and edit validation. IndexedDB stores the image and plan atomically; serialized saves preserve ordering.
2. **Shared mobile editor:** `Canvas.tsx` and `App.tsx`. One SVG drawing surface and project state across Land / Lots / Export. Pointer events support taps, draggable corners, pan, and pinch zoom; screen-sized hit targets, undo/redo, and compact labels support phones. The old disconnected canvas components and center-point rectangle generator are retired.
3. **Inputs and outputs:** `MapPicker.tsx`, `files.ts`. Lazy-loaded Leaflet map picker; image/PDF rasterization; PNG/PDF drawing plus PDF schedule; CSV; validated portable project files. PDF.js and jsPDF are loaded only when needed. Map attribution is preserved on the drawing and exports.
4. **Verification:** geometry invariants, React workflow, and a real saved-plan precision regression. Browser checks cover desktop/phone viewports, generation, editing, persistence, and export.

## Algorithm and practical limits

- Union exclusion areas and road corridors, then subtract them from the full property polygon. Overlapping exclusions count once.
- For each road segment/side, clip frontage strips to the remaining developable land. Adjust the rear reach toward target acreage; widen along the road if the tract is too shallow. Remove assigned polygons before processing the next strip/road so lots cannot overlap.
- Disconnected fragments under 10% of target or without road frontage remain unassigned. Other imperfect candidates are flagged, never represented as approved lots. Generation is limited to 300 lots.
- Acreage warnings use a 5% undersize / 15% oversize band. Frontage measures actual shared boundary with the reserved corridor, not pavement length. Minimum depth is an **average** (area/frontage), not a legal minimum-width/depth test.
- This is a deterministic first-pass heuristic, not a yield optimizer. Road order influences the result. Complex junctions/curves can create undersized lots; merge, edit, or move roads and regenerate. Split lots are re-evaluated and may lose frontage. Exclusion holes are preserved; their interior vertices are not directly editable as lot corners.
- No automatic parcel boundaries, zoning, setbacks, slope/flood analysis, cul-de-sac design, legal access verification, or civil engineering approval. Draw known constraints as exclusions and have an engineer verify the concept.
- Map mode uses OpenStreetMap street tiles, not satellite imagery or address search. Use a screenshot/aerial for satellite detail. Map scale is locally approximated at the selected latitude; use known acreage for calibration when available. Captured map areas are limited to zoom 15 or closer. Uploaded images are not georeferenced; no misleading GeoJSON export is offered.
- PDFs render page 1 and images are resized to a maximum 2,400 px. Maximum upload is 25 MB. Use JPG/PNG for HEIC photos. No image or plat is sent to a server. The map alone requests third-party tiles; location is requested only after tapping My location.
- Autosave is local to one browser/origin, not cloud sync. Project files move work between devices and preview/production URLs. Multiple concurrent browser tabs are not coordinated; use one editing tab per origin.
- The inherited `react-scripts` dependency tree still has development-tool advisories. Production output is static; moving the build tooling off CRA is a separate maintenance follow-up, not an automatic breaking audit fix.

## References

- [Leaflet API](https://leafletjs.com/reference.html)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [polygon-clipping operations](https://github.com/mfogel/polygon-clipping)
