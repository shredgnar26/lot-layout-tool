import { MultiPolygon, Pair } from "polygon-clipping";
export type Point = Pair;
export type Shape = MultiPolygon;
export interface Road {
  id: string;
  points: Point[];
}
export interface Lot {
  id: string;
  name: string;
  shape: Shape;
}
export interface Rules {
  acres: number;
  frontage: number;
  roadWidth: number;
  rowWidth: number;
  minDepth: number;
}
export interface Project {
  version: 1;
  name: string;
  image: string;
  width: number;
  height: number;
  feetPerPixel: number | null;
  source: string;
  boundary: Point[];
  exclusions: { id: string; name: string; points: Point[] }[];
  roads: Road[];
  lots: Lot[];
  rules: Rules;
}
export const uid = () => Math.random().toString(36).slice(2, 11);
export const freshProject = (): Project => ({
  version: 1,
  name: "Untitled property",
  image: "",
  width: 1200,
  height: 900,
  feetPerPixel: null,
  source: "",
  boundary: [],
  exclusions: [],
  roads: [],
  lots: [],
  rules: {
    acres: 1.5,
    frontage: 150,
    roadWidth: 30,
    rowWidth: 50,
    minDepth: 100,
  },
});
export function demoProject(): Project {
  return {
    ...freshProject(),
    name: "Creekside concept",
    source: "Illustrative sample • not a real property",
    feetPerPixel: 1.7,
    boundary: [
      [95, 110],
      [770, 75],
      [1110, 260],
      [1030, 740],
      [650, 825],
      [100, 690],
    ],
    exclusions: [
      {
        id: "pond",
        name: "Pond / area to avoid",
        points: [
          [820, 420],
          [980, 410],
          [965, 620],
          [825, 660],
          [775, 540],
        ],
      },
    ],
    roads: [
      {
        id: "road",
        points: [
          [105, 420],
          [540, 420],
          [760, 300],
        ],
      },
    ],
  };
}
