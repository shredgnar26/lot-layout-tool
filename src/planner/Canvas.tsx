import React, { useMemo, useRef, useState } from "react";
import { Point, Project, Shape } from "./model";
import { bounds, dist, lotMetrics, polygon, roadMask } from "./geometry";
export type Tool =
  "boundary" | "exclusion" | "road" | "calibrate" | "edit" | "pan";
export type Selection = {
  kind: "boundary" | "exclusion" | "road" | "lot";
  id: string;
};
export const pathData = (shape: Shape) =>
  shape
    .map((p) =>
      p.map((r) => `M${r.map((pt) => pt.join(",")).join("L")}Z`).join(""),
    )
    .join("");
export function selectionPoints(p: Project, s: Selection | null): Point[] {
  if (!s) return [];
  if (s.kind === "boundary") return p.boundary;
  if (s.kind === "road")
    return p.roads.find((r) => r.id === s.id)?.points || [];
  if (s.kind === "exclusion")
    return p.exclusions.find((e) => e.id === s.id)?.points || [];
  return p.lots.find((l) => l.id === s.id)?.shape[0][0].slice(0, -1) || [];
}
interface Props {
  p: Project;
  tool: Tool;
  draft: Point[];
  selection: Selection | null;
  vertex: number;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onPoint: (p: Point) => void;
  onSelect: (s: Selection) => void;
  onVertex: (n: number) => void;
  onMove: (n: number, p: Point) => void;
}
export default function Canvas({
  p,
  tool,
  draft,
  selection,
  vertex,
  svgRef,
  onPoint,
  onSelect,
  onVertex,
  onMove,
}: Props) {
  const [view, setView] = useState({ x: 0, y: 0, w: p.width, h: p.height });
  const gesture = useRef<{
    x: number;
    y: number;
    point: Point;
    handle: number | null;
    view: typeof view;
    dragged: boolean;
  } | null>(null);
  const pointers = useRef(new Map<number, Point>()),
    pinch = useRef<{ distance: number; view: typeof view } | null>(null);
  const [drag, setDrag] = useState<{ index: number; point: Point } | null>(
    null,
  );
  const mask = useMemo(() => roadMask(p), [p]),
    points = selectionPoints(p, selection);
  const rect = svgRef.current?.getBoundingClientRect();
  const units = Math.max(
    view.w / (rect?.width || 800),
    view.h / (rect?.height || 450),
  );
  const metrics = useMemo(
    () => new Map(p.lots.map((l) => [l.id, lotMetrics(l, p, mask)])),
    [p, mask],
  );
  function position(e: React.PointerEvent): Point {
    const svg = svgRef.current!,
      point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const v = point.matrixTransform(svg.getScreenCTM()!.inverse());
    return [v.x, v.y];
  }
  function down(e: React.PointerEvent, handle: number | null = null) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.current.size === 2) {
      const a = Array.from(pointers.current.values());
      pinch.current = { distance: dist(a[0], a[1]), view };
      gesture.current = null;
      setDrag(null);
      return;
    }
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      point: position(e),
      handle,
      view,
      dragged: false,
    };
    if (handle !== null) onVertex(handle);
  }
  function move(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current && pointers.current.size === 2) {
      const a = Array.from(pointers.current.values()),
        old = pinch.current,
        factor = Math.max(0.15, Math.min(5, old.distance / dist(a[0], a[1])));
      const w = old.view.w * factor,
        h = old.view.h * factor;
      setView({
        x: old.view.x + (old.view.w - w) / 2,
        y: old.view.y + (old.view.h - h) / 2,
        w,
        h,
      });
      return;
    }
    const g = gesture.current;
    if (!g) return;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 5) g.dragged = true;
    const q = position(e);
    if (g.handle !== null) setDrag({ index: g.handle, point: q });
    else if (tool === "pan")
      setView({
        ...g.view,
        x: g.view.x - (e.clientX - g.x) * units,
        y: g.view.y - (e.clientY - g.y) * units,
      });
  }
  function up(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size === 0) pinch.current = null;
      gesture.current = null;
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.handle !== null) {
      if (g.dragged) onMove(g.handle, position(e));
    } else if (!g.dragged && !["edit", "pan"].includes(tool))
      onPoint(position(e));
    setDrag(null);
  }
  const choose = (e: React.PointerEvent, s: Selection) => {
    if (tool === "edit") {
      e.stopPropagation();
      onSelect(s);
    } else down(e);
  };
  const selected = (kind: Selection["kind"], id: string) =>
    selection?.kind === kind && selection.id === id;
  const zoom = (f: number) =>
    setView((v) => ({
      x: v.x + (v.w * (1 - f)) / 2,
      y: v.y + (v.h * (1 - f)) / 2,
      w: v.w * f,
      h: v.h * f,
    }));
  return (
    <div className="drawing-wrap">
      <div className="view-controls">
        <button aria-label="Zoom in" onClick={() => zoom(0.75)}>
          ＋
        </button>
        <button aria-label="Zoom out" onClick={() => zoom(1.333)}>
          −
        </button>
        <button
          onClick={() => setView({ x: 0, y: 0, w: p.width, h: p.height })}
        >
          Fit
        </button>
      </div>
      <svg
        ref={svgRef}
        className="drawing"
        aria-label="Property planning canvas"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={(e) => down(e)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          gesture.current = null;
          pointers.current.clear();
          pinch.current = null;
          setDrag(null);
        }}
        style={{
          cursor:
            tool === "pan" ? "grab" : tool === "edit" ? "default" : "crosshair",
        }}
      >
        <defs>
          <pattern
            id="grid"
            width="50"
            height="50"
            patternUnits="userSpaceOnUse"
          >
            <path d="M50 0H0V50" fill="none" stroke="#ccd7c9" strokeWidth="1" />
          </pattern>
          <pattern
            id="avoid"
            width="12"
            height="12"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M-3 3L3 -3M0 12L12 0M9 15L15 9"
              stroke="#648696"
              strokeWidth="2"
            />
          </pattern>
        </defs>
        <rect width={p.width} height={p.height} fill="#e7ecdf" />
        {p.image ? (
          <image href={p.image} width={p.width} height={p.height} />
        ) : (
          <rect width={p.width} height={p.height} fill="url(#grid)" />
        )}
        <path
          d={pathData(polygon(p.boundary))}
          fill="#daeab6"
          fillOpacity=".12"
          stroke="#f2b94c"
          strokeWidth={selected("boundary", "boundary") ? 4 : 2}
          vectorEffect="non-scaling-stroke"
          onPointerDown={(e) => choose(e, { kind: "boundary", id: "boundary" })}
        />
        <path
          d={pathData(mask)}
          fill="#f8f5e9"
          fillOpacity=".8"
          stroke="#9a988c"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          fillRule="evenodd"
        />
        {p.lots.map((l) => {
          const m = metrics.get(l.id)!,
            b = bounds(l.shape),
            active = selected("lot", l.id);
          return (
            <g
              key={l.id}
              onPointerDown={(e) => choose(e, { kind: "lot", id: l.id })}
            >
              <path
                d={pathData(l.shape)}
                fill={m.warnings.length ? "#d5a149" : "#59977c"}
                fillOpacity={active ? ".65" : ".3"}
                stroke={active ? "#fff" : "#234b3a"}
                strokeWidth={active ? 3 : 1.5}
                vectorEffect="non-scaling-stroke"
                fillRule="evenodd"
              />
              <text
                x={(b.x + b.right) / 2}
                y={(b.y + b.bottom) / 2}
                textAnchor="middle"
                fill="#18372b"
                fontSize={12 * units}
                fontFamily="sans-serif"
                paintOrder="stroke"
                stroke="#fff"
                strokeWidth={2 * units}
                pointerEvents="none"
              >
                {(b.right - b.x) / units < 65
                  ? l.name.replace(/^Lot /, "")
                  : l.name}
                {(b.right - b.x) / units >= 65 && (
                  <tspan x={(b.x + b.right) / 2} dy={15 * units}>
                    {m.acres.toFixed(2)} ac{m.warnings.length ? " !" : ""}
                  </tspan>
                )}
              </text>
            </g>
          );
        })}
        {p.exclusions.map((ex) => (
          <g
            key={ex.id}
            onPointerDown={(e) => choose(e, { kind: "exclusion", id: ex.id })}
          >
            <path
              d={pathData(polygon(ex.points))}
              fill="#82a8b5"
              fillOpacity=".5"
              stroke="#395f70"
              strokeWidth={selected("exclusion", ex.id) ? 4 : 2}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={pathData(polygon(ex.points))}
              fill="url(#avoid)"
              pointerEvents="none"
            />
          </g>
        ))}
        {p.roads.map((r) => (
          <polyline
            key={r.id}
            points={r.points.map((x) => x.join(",")).join(" ")}
            fill="none"
            stroke={selected("road", r.id) ? "#f6aa47" : "#5a5d53"}
            strokeWidth={p.rules.roadWidth / (p.feetPerPixel || 1)}
            strokeLinejoin="round"
            strokeLinecap="round"
            onPointerDown={(e) => choose(e, { kind: "road", id: r.id })}
          />
        ))}
        <g data-editor="true">
          {draft.length > 0 && (
            <>
              <polyline
                points={draft.map((x) => x.join(",")).join(" ")}
                fill="none"
                stroke="#e66e36"
                strokeWidth={2 * units}
              />
              {draft.map((q, i) => (
                <circle
                  key={i}
                  cx={q[0]}
                  cy={q[1]}
                  r={5 * units}
                  fill="#e66e36"
                  stroke="white"
                  strokeWidth={2 * units}
                />
              ))}
            </>
          )}
          {tool === "edit" &&
            points.map((q, i) => {
              const pt = drag?.index === i ? drag.point : q;
              return (
                <g key={i} onPointerDown={(e) => down(e, i)}>
                  <circle
                    cx={pt[0]}
                    cy={pt[1]}
                    r={16 * units}
                    fill="transparent"
                  />
                  <circle
                    cx={pt[0]}
                    cy={pt[1]}
                    r={(vertex === i ? 7 : 5) * units}
                    fill={vertex === i ? "#ffb94e" : "white"}
                    stroke="#153d30"
                    strokeWidth={2 * units}
                  />
                </g>
              );
            })}
        </g>
        <text
          x={12}
          y={p.height - 12}
          fontSize="12"
          fill="#17332b"
          stroke="white"
          strokeWidth="3"
          paintOrder="stroke"
        >
          {p.source.startsWith("©") ? "© OpenStreetMap contributors" : ""}
        </text>
      </svg>
      <div className="canvas-caption">
        <span>
          <i className="dot boundary" />
          Property
        </span>
        <span>
          <i className="dot excluded" />
          Avoid
        </span>
        <span>
          <i className="dot lots" />
          Lots
        </span>
        <span>Pinch to zoom · Pan to move</span>
      </div>
    </div>
  );
}
