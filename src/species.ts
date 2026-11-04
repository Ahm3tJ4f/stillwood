/**
 * Tree species. Each one has its own leaf colours from the terminal palette.
 *
 * A new tree's species is picked from its seed and stored with its session, so
 * a tree keeps its species even if this list changes later. Older trees that
 * have no stored species get one from their seed the same way.
 */

import { hash2 } from "./random.ts";
import type { CompletedSession } from "./session.ts";

export interface Species {
  id: string;
  name: string;
  /** "a" or "an", for "a maple has grown". */
  article: "a" | "an";
  /** Leaf colours as palette indices: in shade, and in light. */
  leaf: readonly [number, number];
  /** Brown bark, or the white bark of a birch. */
  bark: "brown" | "white";
  /** Conifers are drawn as ♠ on the map. */
  conifer: boolean;
  /** Colour of the blossoms that open when the tree is grown; conifers have none. */
  bloom: number | null;
  /** How often it grows, compared with the others. */
  weight: number;
}

export const SPECIES: readonly Species[] = [
  {
    id: "oak",
    name: "oak",
    article: "an",
    leaf: [2, 10],
    bark: "brown",
    conifer: false,
    bloom: 13,
    weight: 3,
  },
  {
    id: "pine",
    name: "pine",
    article: "a",
    leaf: [2, 2],
    bark: "brown",
    conifer: true,
    bloom: null,
    weight: 2,
  },
  {
    id: "maple",
    name: "maple",
    article: "a",
    leaf: [1, 9],
    bark: "brown",
    conifer: false,
    bloom: 11,
    weight: 2,
  },
  {
    id: "cherry",
    name: "cherry",
    article: "a",
    leaf: [5, 13],
    bark: "brown",
    conifer: false,
    bloom: 15,
    weight: 2,
  },
  {
    id: "birch",
    name: "birch",
    article: "a",
    leaf: [3, 11],
    bark: "white",
    conifer: false,
    bloom: null,
    weight: 2,
  },
  {
    id: "spruce",
    name: "blue spruce",
    article: "a",
    leaf: [6, 14],
    bark: "brown",
    conifer: true,
    bloom: null,
    weight: 1,
  },
  {
    id: "jacaranda",
    name: "jacaranda",
    article: "a",
    leaf: [4, 12],
    bark: "brown",
    conifer: false,
    bloom: 13,
    weight: 1,
  },
];

const TOTAL = SPECIES.reduce((n, s) => n + s.weight, 0);

/** The species a seed grows into. */
export function pickSpecies(seed: number): Species {
  let r = hash2(seed, 41, 97) * TOTAL;
  for (const s of SPECIES) {
    r -= s.weight;
    if (r < 0) return s;
  }
  return SPECIES[0]!;
}

/** The species with this id or name ("spruce" or "blue spruce"), if there is one. */
export function findSpecies(key: string): Species | undefined {
  const k = key.trim().toLowerCase();
  return SPECIES.find((s) => s.id === k || s.name === k);
}

/** The species after this one in the list, back to the first after the last. */
export function nextSpecies(s: Species): Species {
  return SPECIES[(SPECIES.indexOf(s) + 1) % SPECIES.length]!;
}

/** A tree's species: the stored one, or the one its seed grows into. */
export function speciesOf(s: Pick<CompletedSession, "seed" | "species">): Species {
  return SPECIES.find((x) => x.id === s.species) ?? pickSpecies(s.seed);
}

/** "an oak", "a maple". */
export function withArticle(s: Species): string {
  return `${s.article} ${s.name}`;
}
