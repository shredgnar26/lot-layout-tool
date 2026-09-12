import { Project } from "./model";
import { simpleRing } from "./geometry";
const KEY = "lot-planner-v1";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEY, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("projects");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function saveProject(project: Project) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(project, "current");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function loadProject(): Promise<Project | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction("projects")
      .objectStore("projects")
      .get("current");
    req.onsuccess = () => {
      db.close();
      try {
        resolve(req.result ? validateProject(req.result) : null);
      } catch (e) {
        reject(e);
      }
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}
export function validateProject(value: unknown): Project {
  const p = value as Project;
  const number = (x: unknown) =>
    typeof x === "number" && Number.isFinite(x) && x > 0;
  const points = (ps: unknown, min: number) =>
    Array.isArray(ps) &&
    ps.length >= min &&
    ps.length <= 2000 &&
    ps.every(
      (v) =>
        Array.isArray(v) &&
        v.length === 2 &&
        v.every(
          (n) =>
            typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e7,
        ),
    );
  const ring = (ps: unknown) =>
    points(ps, 3) && simpleRing(ps as Project["boundary"]);
  if (
    !p ||
    p.version !== 1 ||
    typeof p.name !== "string" ||
    p.name.length > 200 ||
    typeof p.source !== "string" ||
    typeof p.image !== "string" ||
    (p.image !== "" && !/^data:image\/(png|jpeg|webp);base64,/.test(p.image)) ||
    p.image.length > 30000000 ||
    !number(p.width) ||
    !number(p.height) ||
    p.width > 5000 ||
    p.height > 5000 ||
    (p.feetPerPixel !== null && !number(p.feetPerPixel)) ||
    !points(p.boundary, 0) ||
    (p.boundary.length > 0 && !ring(p.boundary)) ||
    !p.rules ||
    !["acres", "frontage", "roadWidth", "rowWidth", "minDepth"].every((k) =>
      number(p.rules[k as keyof typeof p.rules]),
    ) ||
    !Array.isArray(p.exclusions) ||
    !Array.isArray(p.roads) ||
    !Array.isArray(p.lots) ||
    p.lots.length > 300 ||
    p.roads.length > 100 ||
    p.exclusions.length > 100
  )
    throw new Error("This is not a supported Lot Layout project file.");
  const named = (x: { id: string; name?: string }) =>
    typeof x.id === "string" &&
    (x.name === undefined || typeof x.name === "string");
  if (
    !p.exclusions.every((e) => named(e) && ring(e.points)) ||
    !p.roads.every((r) => named(r) && points(r.points, 2)) ||
    !p.lots.every(
      (l) =>
        named(l) &&
        typeof l.name === "string" &&
        Array.isArray(l.shape) &&
        l.shape.length === 1 &&
        l.shape.every(
          (poly) =>
            Array.isArray(poly) &&
            poly.length > 0 &&
            poly.every(
              (r) =>
                points(r, 4) &&
                r[0][0] === r[r.length - 1][0] &&
                r[0][1] === r[r.length - 1][1] &&
                ring(r.slice(0, -1)),
            ),
        ),
    )
  )
    throw new Error("The project contains invalid shapes.");
  return p;
}
