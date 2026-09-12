import React, {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./App.css";
import Canvas, { Selection, selectionPoints, Tool } from "./planner/Canvas";
const MapPicker = lazy(() => import("./planner/MapPicker"));
import {
  Point,
  Project,
  demoProject,
  freshProject,
  uid,
} from "./planner/model";
import {
  ACRE,
  area,
  combine,
  developable,
  dist,
  excludedMask,
  generateLots,
  lotMetrics,
  polygon,
  roadLength,
  roadMask,
  simpleRing,
  splitLot,
  validLotEdit,
} from "./planner/geometry";
import { loadProject, saveProject, validateProject } from "./planner/storage";
import {
  exportCSV,
  exportDrawing,
  exportProject,
  readBackground,
} from "./planner/files";

export default function App() {
  const [p, setP] = useState<Project>(freshProject),
    [ready, setReady] = useState(false),
    [screen, setScreen] = useState<"home" | "map" | "plan">("home");
  const [tool, setTool] = useState<Tool>("boundary"),
    [draft, setDraft] = useState<Point[]>([]),
    [selection, setSelection] = useState<Selection | null>(null),
    [vertex, setVertex] = useState(0);
  const [past, setPast] = useState<Project[]>([]),
    [future, setFuture] = useState<Project[]>([]),
    [status, setStatus] = useState("Loading saved project…"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [acres, setAcres] = useState(""),
    [feet, setFeet] = useState(""),
    [panel, setPanel] = useState<"land" | "lots" | "export">("land");
  const upload = useRef<HTMLInputElement>(null),
    importFile = useRef<HTMLInputElement>(null),
    svg = useRef<SVGSVGElement>(null),
    saveQueue = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    loadProject()
      .then((saved) => {
        if (active && saved) {
          setP(saved);
          setScreen("plan");
          setTool(saved.boundary.length ? "edit" : "boundary");
        }
      })
      .catch(() => {
        if (active)
          setMessage(
            "Saved project could not be read. You can import a project backup.",
          );
      })
      .finally(() => {
        if (active) {
          setReady(true);
          setStatus("Saved on this device");
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!ready || !p.source) return;
    setStatus("Saving…");
    const job = () => saveProject(p);
    saveQueue.current = saveQueue.current.catch(() => {}).then(job);
    const current = saveQueue.current;
    current
      .then(() => {
        if (saveQueue.current === current) setStatus("Saved on this device");
      })
      .catch(() => setStatus("Save failed — export a project backup"));
  }, [p, ready]);
  function commit(next: Project, structural = false) {
    setPast((h) => [...h.slice(-39), p]);
    setFuture([]);
    setP(structural ? { ...next, lots: [] } : next);
    if (structural && p.lots.length)
      setMessage(
        "Land or rules changed. Generate lots again; Undo restores the previous layout.",
      );
  }
  function start(next: Project) {
    commit(next);
    setScreen("plan");
    setTool("boundary");
    setDraft([]);
    setSelection(null);
    setPanel("land");
    setMessage("Tap around the property, then tap Finish shape.");
  }
  function history(redo = false) {
    const from = redo ? future : past;
    if (!from.length) return;
    const next = from[from.length - 1];
    if (redo) {
      setFuture(from.slice(0, -1));
      setPast((v) => [...v, p]);
    } else {
      setPast(from.slice(0, -1));
      setFuture((v) => [...v, p]);
    }
    setP(next);
    setDraft([]);
    setSelection(null);
    setMessage("");
  }
  function updateRule(key: keyof Project["rules"], raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;
    commit({ ...p, rules: { ...p.rules, [key]: value } }, true);
  }
  function chooseTool(t: Tool) {
    setTool(t);
    setDraft([]);
    setSelection(null);
    setMessage("");
  }
  function finish() {
    try {
      if (tool === "calibrate") {
        const n = Number(feet);
        if (
          draft.length !== 2 ||
          !Number.isFinite(n) ||
          n <= 0 ||
          dist(draft[0], draft[1]) < 1
        )
          throw new Error(
            "Tap two different points and enter their distance in feet.",
          );
        commit({ ...p, feetPerPixel: n / dist(draft[0], draft[1]) }, true);
      } else if (tool === "road") {
        if (
          draft.length < 2 ||
          draft.slice(1).some((q, i) => dist(q, draft[i]) < 1)
        )
          throw new Error("Draw at least two distinct road points.");
        commit(
          { ...p, roads: [...p.roads, { id: uid(), points: draft }] },
          true,
        );
      } else {
        if (!simpleRing(draft))
          throw new Error(
            "Draw at least three corners without crossing the boundary over itself.",
          );
        if (tool === "boundary")
          commit({ ...p, boundary: draft, feetPerPixel: p.feetPerPixel }, true);
        else
          commit(
            {
              ...p,
              exclusions: [
                ...p.exclusions,
                { id: uid(), name: "Area to avoid", points: draft },
              ],
            },
            true,
          );
      }
      setDraft([]);
      setTool("edit");
      setMessage("Shape saved.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function calibrateAcres() {
    const n = Number(acres);
    if (!p.boundary.length || !Number.isFinite(n) || n <= 0) {
      setMessage("Outline the property and enter its known acreage first.");
      return;
    }
    commit(
      { ...p, feetPerPixel: Math.sqrt((n * ACRE) / area(polygon(p.boundary))) },
      true,
    );
    setMessage("Scale set from the outlined acreage.");
  }
  function updatePoints(points: Point[]) {
    if (!selection) return;
    try {
      if (selection.kind === "lot") {
        const lot = p.lots.find((l) => l.id === selection.id)!;
        const shape: typeof lot.shape = [
          [[...points, points[0]], ...lot.shape[0].slice(1)],
        ];
        if (!validLotEdit(shape, p, lot.id))
          throw new Error(
            "That edit crosses another lot, a road, an exclusion, or the property edge.",
          );
        commit({
          ...p,
          lots: p.lots.map((l) => (l.id === lot.id ? { ...l, shape } : l)),
        });
      } else if (selection.kind === "road") {
        if (
          points.length < 2 ||
          points.slice(1).some((q, i) => dist(q, points[i]) < 1)
        )
          throw new Error("A road needs two distinct points.");
        commit(
          {
            ...p,
            roads: p.roads.map((r) =>
              r.id === selection.id ? { ...r, points } : r,
            ),
          },
          true,
        );
      } else {
        if (!simpleRing(points))
          throw new Error(
            "Keep at least three corners and avoid crossing lines.",
          );
        if (selection.kind === "boundary")
          commit({ ...p, boundary: points }, true);
        else
          commit(
            {
              ...p,
              exclusions: p.exclusions.map((e) =>
                e.id === selection.id ? { ...e, points } : e,
              ),
            },
            true,
          );
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function removeSelected() {
    if (!selection) return;
    const next = { ...p };
    if (selection.kind === "lot")
      next.lots = p.lots.filter((l) => l.id !== selection.id);
    if (selection.kind === "road")
      next.roads = p.roads.filter((r) => r.id !== selection.id);
    if (selection.kind === "exclusion")
      next.exclusions = p.exclusions.filter((e) => e.id !== selection.id);
    if (selection.kind === "boundary") next.boundary = [];
    commit(next, selection.kind !== "lot");
    setSelection(null);
  }
  function generate() {
    if (
      p.lots.length &&
      !window.confirm("Replace the existing lots? You can Undo this change.")
    )
      return;
    setBusy(true);
    setTimeout(() => {
      try {
        const lots = generateLots(p);
        commit({ ...p, lots });
        setPanel("lots");
        chooseTool("edit");
        setMessage(
          lots.length
            ? `${lots.length} proposed lots. Review amber lots before exporting.`
            : "No lots fit. Extend the road through the property or reduce the lot targets.",
        );
      } catch (e) {
        setMessage((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 30);
  }
  async function uploadBackground(file: File) {
    setBusy(true);
    try {
      const bg = await readBackground(file);
      start({
        ...freshProject(),
        ...bg,
        name: file.name.replace(/\.[^.]+$/, ""),
        source:
          file.type === "application/pdf"
            ? `${file.name} • PDF page 1`
            : file.name,
      });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const { scale, total, excluded, available, allocated, reviews, metrics } =
    useMemo(() => {
      const scale = p.feetPerPixel || 0,
        mask = roadMask(p);
      const metrics = new Map(
        p.lots.map((l) => [l.id, lotMetrics(l, p, mask)]),
      );
      return {
        scale,
        mask,
        metrics,
        total: (area(polygon(p.boundary)) * scale * scale) / ACRE,
        excluded: (area(excludedMask(p)) * scale * scale) / ACRE,
        available: (area(developable(p)) * scale * scale) / ACRE,
        allocated: p.lots.reduce(
          (s, l) => s + (area(l.shape) * scale * scale) / ACRE,
          0,
        ),
        reviews: Array.from(metrics.values()).filter((m) => m.warnings.length)
          .length,
      };
    }, [p]);
  const selectedLot = p.lots.find(
      (l) => selection?.kind === "lot" && l.id === selection.id,
    ),
    points = selectionPoints(p, selection);
  const instructions: Record<Tool, string> = {
    boundary:
      "Tap each property corner. Irregular shapes are welcome. Finish shape closes the outline.",
    exclusion:
      "Tap around a pond, creek, easement, or other area to avoid. Then Finish shape.",
    road: "Tap the start, bends, and end of a road. Finish shape saves it.",
    calibrate: "Tap two known points, then enter their real distance below.",
    edit: "Tap a lot, road, exclusion, or property edge to select it. Drag its white corners to edit.",
    pan: "Drag to move the drawing. Pinch or use + / − to zoom.",
  };
  return (
    <div className="app">
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setScreen("home");
          }}
        >
          <span className="brand-mark">▱</span>
          <span>
            Lot Layout<small>A little land. A clear plan.</small>
          </span>
        </a>
        <span className="save-status" role="status">
          {ready ? status : "Loading…"}
        </span>
      </header>
      <input
        ref={upload}
        type="file"
        aria-label="Upload aerial or plat"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadBackground(f);
          e.target.value = "";
        }}
      />
      <input
        ref={importFile}
        type="file"
        aria-label="Import project file"
        accept=".json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            if (f.size > 35 * 1024 * 1024)
              throw new Error("Project file is too large.");
            const next = validateProject(JSON.parse(await f.text()));
            start(next);
            setTool("edit");
            setMessage("Project imported.");
          } catch (err) {
            setMessage((err as Error).message);
          }
        }}
      />
      {message && (
        <div className="notice" role="status">
          <span>{message}</span>
          <button aria-label="Dismiss message" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      {screen === "home" && (
        <main className="welcome">
          <div className="eyebrow">FROM PROPERTY TO POSSIBILITY</div>
          <h1>
            Your land.
            <br />
            Your next move.
          </h1>
          <p>
            Turn an aerial, plat, or map into a practical lot concept.
            <br />
            Outline it. Add a road. See what fits.
          </p>
          <div className="start-options">
            <button
              className="start-card"
              disabled={!ready || busy}
              onClick={() => setScreen("map")}
            >
              <span>◎</span>
              <strong>Find on map</strong>
              <small>Pan to your property</small>
            </button>
            <button
              className="start-card"
              disabled={!ready || busy}
              onClick={() => upload.current?.click()}
            >
              <span>↥</span>
              <strong>Upload aerial / plat</strong>
              <small>JPG, PNG, WebP or PDF</small>
            </button>
          </div>
          <div className="row centered">
            {p.source && (
              <button className="primary" onClick={() => setScreen("plan")}>
                Continue {p.name}
              </button>
            )}
            <button
              disabled={!ready}
              onClick={() => {
                start(demoProject());
                setTool("edit");
                setMessage("Sample property ready. Try Generate lots.");
              }}
            >
              Try a sample property
            </button>
            <button
              disabled={!ready}
              onClick={() => importFile.current?.click()}
            >
              Open saved project
            </button>
          </div>
          <div className="welcome-note">
            No account needed. Plans autosave in this browser.
            <br />
            Export a project file to move between phone and desktop.
          </div>
        </main>
      )}
      {screen === "map" && (
        <Suspense fallback={<p className="map-picker">Loading map…</p>}>
          <MapPicker onChoose={start} onCancel={() => setScreen("home")} />
        </Suspense>
      )}
      {screen === "plan" && (
        <main className="planner">
          <div className="project-heading">
            <div>
              <div className="eyebrow">PROPERTY CONCEPT</div>
              <input
                className="project-name"
                aria-label="Project name"
                maxLength={100}
                value={p.name}
                onChange={(e) => commit({ ...p, name: e.target.value })}
              />
            </div>
            <div className="row">
              <button disabled={!past.length} onClick={() => history()}>
                ↶ Undo
              </button>
              <button disabled={!future.length} onClick={() => history(true)}>
                ↷ Redo
              </button>
              <button onClick={() => setScreen("home")}>Projects</button>
            </div>
          </div>
          <div className="stats">
            <div>
              <strong>{scale ? total.toFixed(1) : "—"}</strong>
              <span>total acres</span>
            </div>
            <div>
              <strong>{scale ? available.toFixed(1) : "—"}</strong>
              <span>after exclusions & ROW</span>
            </div>
            <div>
              <strong>{p.lots.length}</strong>
              <span>
                proposed lots{reviews ? ` · ${reviews} to review` : ""}
              </span>
            </div>
            <div>
              <strong>
                {scale ? Math.round(roadLength(p)).toLocaleString() : "—"}
              </strong>
              <span>road feet</span>
            </div>
          </div>
          <div className="workspace">
            <section className="canvas-panel">
              <nav className="tools" aria-label="Drawing tools">
                {(
                  [
                    ["edit", "Select"],
                    ["pan", "Pan"],
                    ["boundary", "Property"],
                    ["exclusion", "Avoid"],
                    ["road", "Road"],
                  ] as [Tool, string][]
                ).map(([t, label]) => (
                  <button
                    key={t}
                    aria-pressed={tool === t}
                    onClick={() => chooseTool(t)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <p className="instruction">{instructions[tool]}</p>
              <Canvas
                key={`${p.source}-${p.width}-${p.height}`}
                p={p}
                tool={tool}
                draft={draft}
                selection={selection}
                vertex={vertex}
                svgRef={svg}
                onPoint={(q) =>
                  setDraft((d) =>
                    tool === "calibrate" && d.length === 2 ? [q] : [...d, q],
                  )
                }
                onSelect={(s) => {
                  setSelection(s);
                  setVertex(0);
                  if (s.kind === "lot") setPanel("lots");
                }}
                onVertex={setVertex}
                onMove={(i, q) =>
                  updatePoints(points.map((pt, j) => (j === i ? q : pt)))
                }
              />
              {!["edit", "pan"].includes(tool) && (
                <div className="draw-actions">
                  <span>{draft.length} points</span>
                  <button
                    disabled={!draft.length}
                    onClick={() => setDraft((d) => d.slice(0, -1))}
                  >
                    Undo point
                  </button>
                  <button
                    disabled={!draft.length}
                    onClick={() => {
                      setDraft([]);
                      setTool("edit");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary"
                    disabled={
                      draft.length <
                      (tool === "road" || tool === "calibrate" ? 2 : 3)
                    }
                    onClick={finish}
                  >
                    {tool === "calibrate"
                      ? "Set distance scale"
                      : "Finish shape"}
                  </button>
                </div>
              )}
              {selection && (
                <div className="selection-editor">
                  <strong>
                    {selectedLot?.name || `Selected ${selection.kind}`}
                  </strong>
                  <span>
                    Corner {vertex + 1} of {points.length}
                  </span>
                  <div className="row">
                    <button
                      onClick={() => setVertex((v) => (v + 1) % points.length)}
                    >
                      Next corner
                    </button>
                    <button
                      onClick={() => {
                        const a = points[vertex],
                          b = points[(vertex + 1) % points.length];
                        if (!a || !b) return;
                        const next = [...points];
                        next.splice(vertex + 1, 0, [
                          (a[0] + b[0]) / 2,
                          (a[1] + b[1]) / 2,
                        ]);
                        updatePoints(next);
                      }}
                    >
                      Add corner
                    </button>
                    <button
                      disabled={
                        points.length <= (selection.kind === "road" ? 2 : 3)
                      }
                      onClick={() => {
                        updatePoints(points.filter((_, i) => i !== vertex));
                        setVertex(0);
                      }}
                    >
                      Remove corner
                    </button>
                    <button className="danger" onClick={removeSelected}>
                      Delete {selection.kind}
                    </button>
                  </div>
                  <small>
                    Changes to property, roads, or exclusions clear generated
                    lots. Undo restores them.
                  </small>
                </div>
              )}
            </section>
            <aside>
              <nav className="panel-tabs">
                {(["land", "lots", "export"] as const).map((s, i) => (
                  <button
                    key={s}
                    aria-pressed={panel === s}
                    onClick={() => setPanel(s)}
                  >
                    {i + 1}. {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </nav>
              {panel === "land" && (
                <section className="card">
                  <h2>Start with the land</h2>
                  <p>
                    Outline the full property, then mark what you want to avoid.
                  </p>
                  <button
                    className="wide"
                    onClick={() => chooseTool("boundary")}
                  >
                    {p.boundary.length ? "Redraw property" : "Outline property"}
                  </button>
                  <button
                    className="wide"
                    onClick={() => chooseTool("exclusion")}
                  >
                    + Mark area to avoid
                  </button>
                  <div className="divider" />
                  <h3>{scale ? "Scale is set" : "Set the scale"}</h3>
                  <label>
                    Known property acreage
                    <div className="row">
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={acres}
                        placeholder="e.g. 49"
                        onChange={(e) => setAcres(e.target.value)}
                      />
                      <button
                        disabled={!p.boundary.length}
                        onClick={calibrateAcres}
                      >
                        Set
                      </button>
                    </div>
                  </label>
                  <small>
                    Trace the full boundary first. Use the actual acreage from
                    the plat.
                  </small>
                  <details>
                    <summary>Or use a known distance</summary>
                    <button
                      className="wide"
                      onClick={() => chooseTool("calibrate")}
                    >
                      Mark two points
                    </button>
                    <label>
                      Distance between points (ft)
                      <input
                        type="number"
                        min="1"
                        value={feet}
                        onChange={(e) => setFeet(e.target.value)}
                      />
                    </label>
                  </details>
                  {scale > 0 && (
                    <p className="mini-stats">
                      {excluded.toFixed(2)} ac excluded ·{" "}
                      {Math.max(0, total - excluded - available).toFixed(2)} ac
                      in road ROW
                    </p>
                  )}
                  <button
                    className="primary wide"
                    disabled={!p.boundary.length || !scale}
                    onClick={() => {
                      setPanel("lots");
                      chooseTool("road");
                    }}
                  >
                    Next: roads & lots →
                  </button>
                </section>
              )}
              {panel === "lots" && (
                <section className="card">
                  <h2>Make room for the plan</h2>
                  <p>
                    Draw road centerlines. Lots follow the road and the real
                    property edges.
                  </p>
                  <button className="wide" onClick={() => chooseTool("road")}>
                    + Draw a road
                  </button>
                  <label>
                    Target lot size (acres)
                    <input
                      type="number"
                      min="0.01"
                      step="0.25"
                      value={p.rules.acres}
                      onChange={(e) => updateRule("acres", e.target.value)}
                    />
                  </label>
                  <label>
                    Minimum road frontage (ft)
                    <input
                      type="number"
                      min="1"
                      value={p.rules.frontage}
                      onChange={(e) => updateRule("frontage", e.target.value)}
                    />
                  </label>
                  <label>
                    Road pavement width (ft)
                    <input
                      type="number"
                      min="1"
                      value={p.rules.roadWidth}
                      onChange={(e) => updateRule("roadWidth", e.target.value)}
                    />
                  </label>
                  <details>
                    <summary>Advanced settings</summary>
                    <label>
                      Road right-of-way width (ft)
                      <input
                        type="number"
                        min="1"
                        value={p.rules.rowWidth}
                        onChange={(e) => updateRule("rowWidth", e.target.value)}
                      />
                    </label>
                    <small>
                      Reserved width uses the larger of pavement and
                      right-of-way.
                    </small>
                    <label>
                      Minimum average depth (ft)
                      <input
                        type="number"
                        min="1"
                        value={p.rules.minDepth}
                        onChange={(e) => updateRule("minDepth", e.target.value)}
                      />
                    </label>
                    <small>
                      Average depth = area ÷ frontage. Setbacks, legal access,
                      drainage and buildability require separate review.
                    </small>
                  </details>
                  <button
                    className="primary wide generate"
                    disabled={
                      busy || !scale || !p.boundary.length || !p.roads.length
                    }
                    onClick={generate}
                  >
                    {busy
                      ? "Working…"
                      : p.lots.length
                        ? "Regenerate lots"
                        : "Generate lots"}
                  </button>
                  {!scale && <small>Set the scale in Land first.</small>}
                  {selectedLot && (
                    <div className="lot-editor">
                      <h3>Edit selected lot</h3>
                      <label>
                        Lot name
                        <input
                          maxLength={40}
                          value={selectedLot.name}
                          onChange={(e) =>
                            commit({
                              ...p,
                              lots: p.lots.map((l) =>
                                l.id === selectedLot.id
                                  ? { ...l, name: e.target.value }
                                  : l,
                              ),
                            })
                          }
                        />
                      </label>
                      <div className="row">
                        {[true, false].map((vertical) => (
                          <button
                            key={String(vertical)}
                            onClick={() => {
                              const pieces = splitLot(selectedLot, vertical);
                              commit({
                                ...p,
                                lots: [
                                  ...p.lots.filter(
                                    (l) => l.id !== selectedLot.id,
                                  ),
                                  ...pieces.map((shape, i) => ({
                                    id: uid(),
                                    name: `${selectedLot.name}${String.fromCharCode(65 + i)}`,
                                    shape,
                                  })),
                                ],
                              });
                              setSelection(null);
                            }}
                          >
                            Split {vertical ? "↔" : "↕"}
                          </button>
                        ))}
                      </div>
                      <label>
                        Merge with adjoining lot
                        <select
                          value=""
                          onChange={(e) => {
                            const other = p.lots.find(
                              (l) => l.id === e.target.value,
                            );
                            if (!other) return;
                            const shape = combine([
                              selectedLot.shape,
                              other.shape,
                            ]);
                            if (shape.length !== 1) {
                              setMessage("Choose a lot that shares an edge.");
                              return;
                            }
                            commit({
                              ...p,
                              lots: [
                                ...p.lots.filter(
                                  (l) =>
                                    l.id !== other.id &&
                                    l.id !== selectedLot.id,
                                ),
                                { ...selectedLot, shape },
                              ],
                            });
                          }}
                        >
                          <option value="">Choose lot…</option>
                          {p.lots
                            .filter((l) => l.id !== selectedLot.id)
                            .map((l) => (
                              <option value={l.id} key={l.id}>
                                {l.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                  )}
                  {p.lots.length > 0 && (
                    <>
                      <p className="mini-stats">
                        {Math.max(0, available - allocated).toFixed(2)} ac
                        unassigned · {reviews} lots to review
                      </p>
                      <div className="lot-list">
                        {p.lots.map((l) => {
                          const m = metrics.get(l.id)!;
                          return (
                            <button
                              key={l.id}
                              className={m.warnings.length ? "review" : ""}
                              onClick={() => {
                                setSelection({ kind: "lot", id: l.id });
                                setVertex(0);
                                setTool("edit");
                              }}
                            >
                              <strong>
                                {l.name}
                                <span>{m.acres.toFixed(2)} ac</span>
                              </strong>
                              <small>
                                {Math.round(m.frontage)} ft frontage
                                {m.warnings.length
                                  ? ` · ${m.warnings.join(" · ")}`
                                  : " · Meets entered targets"}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                      <button
                        className="wide"
                        onClick={() => setPanel("export")}
                      >
                        Next: export →
                      </button>
                    </>
                  )}
                </section>
              )}
              {panel === "export" && (
                <section className="card">
                  <h2>Take the plan with you</h2>
                  <p>
                    {p.lots.length} proposed lots · {allocated.toFixed(2)} acres
                    in lots.
                  </p>
                  {reviews > 0 && (
                    <p className="review-note">
                      {reviews} lots need review. Amber means acreage, frontage,
                      or shape needs attention.
                    </p>
                  )}
                  {(["png", "pdf"] as const).map((format) => (
                    <button
                      key={format}
                      className="wide"
                      disabled={busy || !p.boundary.length || !scale}
                      onClick={async () => {
                        if (!svg.current) return;
                        setBusy(true);
                        try {
                          await exportDrawing(svg.current, p, format);
                          setMessage(`${format.toUpperCase()} exported.`);
                        } catch (e) {
                          setMessage((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Export {format.toUpperCase()}
                      {format === "pdf" ? " + lot schedule" : ""}
                    </button>
                  ))}
                  <button
                    className="wide"
                    disabled={!p.lots.length}
                    onClick={() => exportCSV(p)}
                  >
                    Export lot table (CSV)
                  </button>
                  <div className="divider" />
                  <button
                    className="primary wide"
                    onClick={() => exportProject(p)}
                  >
                    Save project file
                  </button>
                  <p className="small">
                    Includes your image and editable plan. Open it on another
                    phone or computer to continue. Autosave stays in this
                    browser only.
                  </p>
                  <button
                    className="wide"
                    onClick={() => importFile.current?.click()}
                  >
                    Open project file
                  </button>
                </section>
              )}
            </aside>
          </div>
          <footer>
            Concept planning only. A surveyor or engineer must verify
            boundaries, access, infrastructure, and local requirements.
          </footer>
        </main>
      )}
    </div>
  );
}
