import { demoProject, freshProject, Lot, Project } from "./model";
import {
  area,
  combine,
  developable,
  generateLots,
  intersect,
  lotMetrics,
  polygon,
  roadMask,
  simpleRing,
  splitLot,
  subtract,
  validLotEdit,
} from "./geometry";
import { validateProject } from "./storage";
const rectangle = (): Project => ({
  ...freshProject(),
  width: 1200,
  height: 1000,
  source: "test",
  feetPerPixel: 1,
  boundary: [
    [0, 0],
    [1200, 0],
    [1200, 1000],
    [0, 1000],
  ],
  roads: [
    {
      id: "r",
      points: [
        [0, 500],
        [1200, 500],
      ],
    },
  ],
});
function assertTopology(p: Project, lots: Lot[]) {
  const develop = developable(p);
  for (let i = 0; i < lots.length; i++) {
    expect(area(subtract(lots[i].shape, develop))).toBeLessThan(0.001);
    expect(lots[i].shape.length).toBe(1);
    for (let j = i + 1; j < lots.length; j++)
      expect(area(intersect(lots[i].shape, lots[j].shape))).toBeLessThan(0.001);
  }
  expect(area(combine(lots.map((l) => l.shape)))).toBeLessThanOrEqual(
    area(develop) + 0.001,
  );
}
test("clips all lots inside a concave irregular tract and excludes an internal pond", () => {
  const p = demoProject();
  p.boundary.splice(3, 0, [860, 380]);
  const lots = generateLots(p);
  expect(lots.length).toBeGreaterThan(3);
  assertTopology(p, lots);
});
test("intersecting and bent roads reserve the entire corridor and never duplicate lots", () => {
  const p = rectangle();
  p.roads.push({
    id: "cross",
    points: [
      [300, 0],
      [300, 800],
      [1000, 950],
    ],
  });
  const lots = generateLots(p);
  assertTopology(p, lots);
  expect(
    area(intersect(combine(lots.map((l) => l.shape)), roadMask(p))),
  ).toBeLessThan(0.001);
});
test("frontage comes from the actual shared road edge and target warnings stay visible", () => {
  const p = rectangle();
  const lots = generateLots(p);
  const m = lotMetrics(lots[0], p);
  expect(m.frontage).toBeCloseTo(150, 1);
  expect(m.acres).toBeCloseTo(1.5, 3);
  expect(m.warnings).toEqual([]);
  const inland: Lot = {
    id: "inland",
    name: "Inland",
    shape: polygon([
      [10, 10],
      [100, 10],
      [100, 100],
      [10, 100],
    ]),
  };
  expect(lotMetrics(inland, p).warnings).toContain("No road frontage");
});
test("split and merge conserve area including exclusion holes", () => {
  const p = rectangle();
  p.exclusions = [
    {
      id: "hole",
      name: "pond",
      points: [
        [20, 20],
        [60, 20],
        [60, 60],
        [20, 60],
      ],
    },
  ];
  const l = generateLots(p)[0];
  const pieces = splitLot(l, true);
  expect(pieces.length).toBeGreaterThan(1);
  expect(pieces.reduce((s, g) => s + area(g), 0)).toBeCloseTo(area(l.shape), 4);
  expect(area(combine(pieces))).toBeCloseTo(area(l.shape), 4);
});
test("rejects edits overlapping neighbors, roads, or the property boundary", () => {
  const p = rectangle();
  p.lots = generateLots(p);
  const l = p.lots[0];
  expect(validLotEdit(l.shape, p, l.id)).toBe(true);
  expect(
    validLotEdit(
      polygon([
        [-10, 0],
        [400, 0],
        [400, 600],
        [-10, 600],
      ]),
      p,
      l.id,
    ),
  ).toBe(false);
  expect(validLotEdit(p.lots[1].shape, p, l.id)).toBe(false);
});
test("overlapping exclusions count once and outside exclusion acreage is clipped", () => {
  const p = rectangle();
  p.exclusions = [
    {
      id: "a",
      name: "a",
      points: [
        [-50, 0],
        [100, 0],
        [100, 100],
        [-50, 100],
      ],
    },
    {
      id: "b",
      name: "b",
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
    },
  ];
  expect(area(developable(p))).toBeCloseTo(1200000 - 60000 - 10000, 1);
});
test("rejects self crossings and zero scale or invalid rules", () => {
  expect(
    simpleRing([
      [0, 0],
      [100, 100],
      [0, 100],
      [100, 0],
    ]),
  ).toBe(false);
  const p = rectangle();
  p.feetPerPixel = null;
  expect(() => generateLots(p)).toThrow();
  p.feetPerPixel = 1;
  p.rules.acres = 0;
  expect(() => generateLots(p)).toThrow();
});
test("project roundtrip preserves geometry and rejects foreign or malformed files", () => {
  const p = rectangle();
  p.lots = generateLots(p);
  expect(validateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  expect(() => validateProject({ version: 2 })).toThrow();
  expect(() =>
    validateProject({ ...p, image: "https://example.com/tracker.png" }),
  ).toThrow();
  expect(() =>
    validateProject({
      ...p,
      boundary: [
        [0, 0],
        [1, 1],
        [0, 1],
        [1, 0],
      ],
    }),
  ).toThrow();
});
test("small islands remain unassigned instead of becoming counted slivers", () => {
  const p = rectangle();
  p.exclusions = [
    {
      id: "barrier",
      name: "barrier",
      points: [
        [20, 0],
        [40, 0],
        [40, 450],
        [20, 450],
      ],
    },
  ];
  assertTopology(p, generateLots(p));
});
