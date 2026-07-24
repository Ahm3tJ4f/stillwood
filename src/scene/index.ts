import { Canvas } from "../canvas.ts";
import { renderForest } from "./forest.ts";
import { renderGarden } from "./garden.ts";
import type { Frame, HitTarget, Scene } from "./types.ts";

/** Render a full frame. Pure apart from the tree cache. */
export function renderScene(scene: Scene): Frame {
  const c: Frame = new Canvas<HitTarget>(scene.width, scene.height);
  if (scene.view === "garden") renderGarden(c, scene);
  else renderForest(c, scene);
  return c;
}

/** What a click at a screen cell does, if anything. */
export function hitAt(scene: Scene, x: number, y: number): HitTarget | null {
  return renderScene(scene).hitAt(x, y);
}

export type { Scene, GardenScene, ForestScene, HitTarget } from "./types.ts";
