import { difference, intersection, union } from "polygon-clipping";
import { Lot, Point, Project, Shape, uid } from "./model";
export const ACRE = 43560;
export const dist = (a: Point, b: Point) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
export const polygon = (p: Point[]): Shape =>
  p.length >= 3
    ? [
        [
          [...p, p[0]].map(
            (q) => q.map((v) => Math.round(v * 1e6) / 1e6) as Point,
          ),
        ],
      ]
    : [];
export function ringArea(p: Point[]): number {
  return (
    Math.abs(
      p.reduce((s, a, i) => {
        const b = p[(i + 1) % p.length];
        return s + a[0] * b[1] - b[0] * a[1];
      }, 0),
    ) / 2
  );
}
export const area = (s: Shape): number =>
  s.reduce(
    (a, p) =>
      a + ringArea(p[0]) - p.slice(1).reduce((n, r) => n + ringArea(r), 0),
    0,
  );
export const subtract = (a: Shape, b: Shape): Shape =>
  !a.length ? [] : !b.length ? a : difference(a, b);
export const intersect = (a: Shape, b: Shape): Shape =>
  !a.length || !b.length ? [] : intersection(a, b);
export const combine = (shapes: Shape[]): Shape =>
  shapes
    .filter((s) => s.length)
    .reduce((a, s) => (a.length ? union(a, s) : s), [] as Shape);
export function bounds(s: Shape) {
  const ps = s.flat(2);
  return {
    x: Math.min(...ps.map((p) => p[0])),
    y: Math.min(...ps.map((p) => p[1])),
    right: Math.max(...ps.map((p) => p[0])),
    bottom: Math.max(...ps.map((p) => p[1])),
  };
}
export function simpleRing(ps: Point[]): boolean {
  if (
    ps.length < 3 ||
    ps.some((p) => p.some((v) => !Number.isFinite(v))) ||
    ringArea(ps) < 0.01
  )
    return false;
  const cross = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i],
      b = ps[(i + 1) % ps.length];
    if (dist(a, b) < 1e-9) return false;
    for (let j = i + 1; j < ps.length; j++) {
      if (j === i + 1 || (i === 0 && j === ps.length - 1)) continue;
      const c = ps[j],
        d = ps[(j + 1) % ps.length];
      if (
        cross(a, b, c) * cross(a, b, d) <= 0 &&
        cross(c, d, a) * cross(c, d, b) <= 0 &&
        Math.max(a[0], b[0]) >= Math.min(c[0], d[0]) &&
        Math.max(c[0], d[0]) >= Math.min(a[0], b[0]) &&
        Math.max(a[1], b[1]) >= Math.min(c[1], d[1]) &&
        Math.max(c[1], d[1]) >= Math.min(a[1], b[1])
      )
        return false;
    }
  }
  return true;
}
export function roadMask(p: Project): Shape {
  if (!p.feetPerPixel) return [];
  const radius =
    Math.max(p.rules.roadWidth, p.rules.rowWidth) / p.feetPerPixel / 2;
  return combine(
    p.roads.flatMap((r) => {
      const shapes: Shape[] = r.points.map((c) =>
        polygon(
          Array.from(
            { length: 24 },
            (_, i) =>
              [
                c[0] + radius * Math.cos((i * Math.PI) / 12),
                c[1] + radius * Math.sin((i * Math.PI) / 12),
              ] as Point,
          ),
        ),
      );
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1],
          b = r.points[i],
          len = dist(a, b);
        if (len < 0.01) continue;
        const x = (-(b[1] - a[1]) / len) * radius,
          y = ((b[0] - a[0]) / len) * radius;
        shapes.push(
          polygon([
            [a[0] + x, a[1] + y],
            [b[0] + x, b[1] + y],
            [b[0] - x, b[1] - y],
            [a[0] - x, a[1] - y],
          ]),
        );
      }
      return shapes;
    }),
  );
}
export const excludedMask = (p: Project) =>
  intersect(
    polygon(p.boundary),
    combine(p.exclusions.map((e) => polygon(e.points))),
  );
export const developable = (p: Project) =>
  subtract(subtract(polygon(p.boundary), excludedMask(p)), roadMask(p));
export const roadLength = (p: Project) =>
  p.roads.reduce(
    (s, r) =>
      s + r.points.slice(1).reduce((n, b, i) => n + dist(r.points[i], b), 0),
    0,
  ) * (p.feetPerPixel || 0);
// Measure actual shared boundary with the reserved road corridor, not a nominal strip width.
export function frontage(shape: Shape, mask: Shape): number {
  let total = 0;
  for (const poly of shape)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i],
          len = dist(a, b);
        if (len < 1e-7) continue;
        const ux = (b[0] - a[0]) / len,
          uy = (b[1] - a[1]) / len;
        const intervals: [number, number][] = [];
        for (const q of mask)
          for (const edge of q)
            for (let j = 1; j < edge.length; j++) {
              const c = edge[j - 1],
                d = edge[j];
              if (
                Math.abs((c[0] - a[0]) * uy - (c[1] - a[1]) * ux) > 0.01 ||
                Math.abs((d[0] - a[0]) * uy - (d[1] - a[1]) * ux) > 0.01
              )
                continue;
              const t1 = (c[0] - a[0]) * ux + (c[1] - a[1]) * uy,
                t2 = (d[0] - a[0]) * ux + (d[1] - a[1]) * uy;
              const lo = Math.max(0, Math.min(t1, t2)),
                hi = Math.min(len, Math.max(t1, t2));
              if (hi > lo) intervals.push([lo, hi]);
            }
        intervals.sort((a, b) => a[0] - b[0]);
        let end = -Infinity;
        for (const [lo, hi] of intervals) {
          total += Math.max(0, hi - Math.max(lo, end));
          end = Math.max(end, hi);
        }
      }
  return total;
}
export function lotMetrics(l: Lot, p: Project, mask = roadMask(p)) {
  const scale = p.feetPerPixel || 0,
    sqft = area(l.shape) * scale * scale,
    ft = frontage(l.shape, mask) * scale;
  const warnings: string[] = [];
  if (sqft / ACRE < p.rules.acres * 0.95) warnings.push("Below target acreage");
  if (sqft / ACRE > p.rules.acres * 1.15) warnings.push("Above target acreage");
  if (ft + 0.1 < p.rules.frontage)
    warnings.push(ft < 1 ? "No road frontage" : "Short road frontage");
  if (ft > 0 && sqft / ft < p.rules.minDepth)
    warnings.push("Shallow average depth");
  if (l.shape.some((poly) => poly.length > 1))
    warnings.push("Contains an excluded island");
  return { acres: sqft / ACRE, frontage: ft, warnings };
}
export function generateLots(p: Project): Lot[] {
  const scale = p.feetPerPixel;
  if (!scale || !simpleRing(p.boundary) || !p.roads.length)
    throw new Error(
      "Outline the property, set its scale, and draw a road first.",
    );
  if (Object.values(p.rules).some((x) => !Number.isFinite(x) || x <= 0))
    throw new Error("Lot rules must be positive numbers.");
  const mask = roadMask(p);
  let remaining = developable(p);
  const lots: Lot[] = [];
  const target = (p.rules.acres * ACRE) / (scale * scale),
    minWidth = p.rules.frontage / scale;
  const depth = Math.hypot(p.width, p.height) * 2;
  for (const road of p.roads)
    for (let j = 1; j < road.points.length; j++) {
      const a = road.points[j - 1],
        b = road.points[j],
        len = dist(a, b);
      if (len < 1) continue;
      const ux = (b[0] - a[0]) / len,
        uy = (b[1] - a[1]) / len;
      for (const side of [-1, 1]) {
        const at = (along: number, out: number): Point => [
          a[0] + ux * along - uy * out * side,
          a[1] + uy * along + ux * out * side,
        ];
        let start = 0;
        while (start < len - 0.01) {
          if (lots.length >= 300)
            throw new Error(
              "This concept exceeds 300 lots. Increase target lot size or plan a smaller tract.",
            );
          const candidate = (end: number, reach = depth) =>
            intersect(
              remaining,
              polygon([
                at(start, 0),
                at(end, 0),
                at(end, reach),
                at(start, reach),
              ]),
            );
          let lo = Math.min(len, start + minWidth),
            hi = len;
          if (area(candidate(lo)) < target)
            for (let n = 0; n < 24; n++) {
              const mid = (lo + hi) / 2;
              if (area(candidate(mid)) < target) lo = mid;
              else hi = mid;
            }
          const end = lo;
          let near = 0,
            far = depth;
          if (area(candidate(end)) > target)
            for (let n = 0; n < 24; n++) {
              const mid = (near + far) / 2;
              if (area(candidate(end, mid)) < target) near = mid;
              else far = mid;
            }
          const shape = candidate(end, far);
          for (const poly of shape) {
            const piece: Shape = [poly];
            // Keep small disconnected fragments unassigned, visible in the acreage summary.
            if (area(piece) < target * 0.1 || frontage(piece, mask) * scale < 1)
              continue;
            lots.push({
              id: uid(),
              name: `Lot ${lots.length + 1}`,
              shape: piece,
            });
            remaining = subtract(remaining, piece);
          }
          start = end;
        }
      }
    }
  return lots;
}
export function splitLot(lot: Lot, vertical: boolean): Shape[] {
  const b = bounds(lot.shape),
    m = vertical ? (b.x + b.right) / 2 : (b.y + b.bottom) / 2;
  const half = polygon(
    vertical
      ? [
          [b.x - 1, b.y - 1],
          [m, b.y - 1],
          [m, b.bottom + 1],
          [b.x - 1, b.bottom + 1],
        ]
      : [
          [b.x - 1, b.y - 1],
          [b.right + 1, b.y - 1],
          [b.right + 1, m],
          [b.x - 1, m],
        ],
  );
  return [...intersect(lot.shape, half), ...subtract(lot.shape, half)].map(
    (p) => [p],
  );
}
export function validLotEdit(shape: Shape, p: Project, id: string): boolean {
  if (
    !shape.length ||
    shape.some((poly) => poly.some((r) => !simpleRing(r.slice(0, -1))))
  )
    return false;
  const tolerance = 0.01;
  return (
    area(subtract(shape, developable(p))) < tolerance &&
    p.lots
      .filter((l) => l.id !== id)
      .every((l) => area(intersect(shape, l.shape)) < tolerance)
  );
}
