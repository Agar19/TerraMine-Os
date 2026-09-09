/**
 * Deterministic pseudo-random helpers.
 *
 * The demo dataset must look the same on every machine — screenshots,
 * training material and support conversations all depend on it — so the
 * seed generator never touches Math.random.
 */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Rng {
  private next: () => number

  constructor(seed = 20260907) {
    this.next = mulberry32(seed)
  }

  float(min = 0, max = 1): number {
    return min + this.next() * (max - min)
  }

  /** Rounded to `dp` decimals — most mining measures are reported to 1-3. */
  num(min: number, max: number, dp = 2): number {
    const v = this.float(min, max)
    const f = 10 ** dp
    return Math.round(v * f) / f
  }

  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1))
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]
  }

  /** Weighted pick: [[value, weight], ...] */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((sum, [, w]) => sum + w, 0)
    let roll = this.next() * total
    for (const [value, weight] of items) {
      roll -= weight
      if (roll <= 0) return value
    }
    return items[items.length - 1][0]
  }

  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items]
    const out: T[] = []
    for (let i = 0; i < count && pool.length > 0; i++) {
      out.push(pool.splice(Math.floor(this.next() * pool.length), 1)[0])
    }
    return out
  }

  /** Normal-ish value via the mean of three draws; keeps series realistic. */
  around(mean: number, spreadPct = 0.15, dp = 2): number {
    const drift = ((this.next() + this.next() + this.next()) / 3 - 0.5) * 2 * spreadPct
    const f = 10 ** dp
    return Math.round(mean * (1 + drift) * f) / f
  }
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function isoStamp(d: Date): string {
  return d.toISOString()
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

export function addHours(base: Date, hours: number): Date {
  const d = new Date(base)
  d.setUTCHours(d.getUTCHours() + hours)
  return d
}
