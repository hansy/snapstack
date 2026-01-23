export type CounterType =
  | "p1p1"
  | "m1m1"
  | "loyalty"
  | "charge"
  | "energy"
  | "poison"
  | "commander"
  | string;

export interface Counter {
  type: string;
  count: number;
  color?: string; // Hex code for custom counters
}
