/** The twelve-column layout is the same manifest geometry for the designer and published renderer. */
import type { CSSProperties } from "react";
import type { Block } from "./types";
export type Geometry = NonNullable<Block["geometry"]>;
export function geometry(block: Block, index = 0): Geometry {
  return block.geometry ?? { x: 0, y: index * 6, w: 12, h: 6 };
}
const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;
export function snap(g: Geometry): Geometry {
  const w = Math.max(1, Math.min(12, Math.round(finite(g.w, 1))));
  return {
    x: Math.max(0, Math.min(12 - w, Math.round(finite(g.x)))),
    y: Math.max(0, Math.min(200, Math.round(finite(g.y)))),
    w,
    h: Math.max(1, Math.min(40, Math.round(finite(g.h, 1)))),
  };
}
export function geometryStyle(b: Block, index = 0): CSSProperties {
  const g = snap(geometry(b, index));
  return {
    gridColumn: `${g.x + 1} / span ${g.w}`,
    gridRow: `${g.y + 1} / span ${g.h}`,
  };
}
