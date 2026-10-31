// The cars, for you and for the AI. As SuperTuxKart's kart classes (light, medium, heavy) do, each
// is the road's car (pack.car, the one the track's limits are worked out for) with some numbers
// changed: `times` multiply the road's car, the rest replace physics.js's HANDLING. No car is best
// everywhere: tight tracks suit the light one, long straights the strong one
// (tests/js/physics.test.mjs checks that). What they look like is carshapes.js.

export const CARS = {
  gt: { times: {}, handling: {} },
  hornet: {
    times: { vmax: 0.9, accel: 0.95, brake: 1.15, lat: 1.09 },
    handling: { turnIn: 0.045, agility: 1.1 },
  },
  bison: {
    times: { vmax: 1.1, accel: 1.25, brake: 0.86, lat: 0.89 },
    handling: { turnIn: 0.085, slide: 0.34 },
  },
  fox: {
    times: { vmax: 0.98, accel: 1.14, brake: 0.98, lat: 0.98 },
    handling: { turnIn: 0.05, slide: 0.42, agility: 1.6, settle: 0.26 },
  },
};

export function carSpec(name, base) {
  const { times, handling } = CARS[name] || CARS.gt;
  const spec = { ...base, ...handling };
  for (const [k, v] of Object.entries(times)) spec[k] = base[k] * v;
  return spec;
}

// What the picker shows: each number from 0 to 1 among the cars, the worst car 0 and the best 1.
export function carStats(base) {
  const specs = Object.fromEntries(Object.keys(CARS).map((name) => [name, carSpec(name, base)]));
  const measures = {
    power: (s) => s.accel,
    top: (s) => s.vmax,
    grip: (s) => s.lat,
    brake: (s) => s.brake,
    nimble: (s) => 1 / (s.turnIn ?? 0.06),
  };
  const out = {};
  for (const [name, spec] of Object.entries(specs)) {
    out[name] = {};
    for (const [stat, of] of Object.entries(measures)) {
      const all = Object.values(specs).map(of);
      const low = Math.min(...all);
      const high = Math.max(...all);
      out[name][stat] = high > low ? (of(spec) - low) / (high - low) : 0.5;
    }
  }
  return out;
}
