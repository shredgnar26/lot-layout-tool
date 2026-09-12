import fixture from "./restore-fixture.json";
import { validateProject } from "./storage";
// This bent-road fixture includes two valid clipped vertices only ~8e-8 px apart.
// Saved plans must accept the geometry produced by their own clipping engine.
test("reloads generated irregular lots with near-coincident clipped vertices", () => {
  expect(() => validateProject(fixture)).not.toThrow();
});
