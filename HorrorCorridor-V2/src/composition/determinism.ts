function normalizeSeedText(value: number | string): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.trunc(value)) : String(value);
}

export function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeSeed(value: number | string | undefined): number {
  if (value === undefined) return 0x48435632;
  return hashText(normalizeSeedText(value)) || 1;
}

export type DeterministicRandom = Readonly<{
  next: () => number;
  between: (minimum: number, maximum: number) => number;
  integer: (minimum: number, maximum: number) => number;
  state: () => number;
  restore: (state: number) => void;
}>;

export function createDeterministicRandom(initialSeed: number): DeterministicRandom {
  let state = initialSeed >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };

  return Object.freeze({
    next,
    between: (minimum, maximum) => minimum + (maximum - minimum) * next(),
    integer: (minimum, maximum) => Math.floor(minimum + (maximum - minimum + 1) * next()),
    state: () => state,
    restore: (value) => {
      state = value >>> 0 || 1;
    },
  });
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 1_000_000) / 1_000_000;
  return value;
}

export function deterministicDigest(value: unknown): string {
  return hashText(JSON.stringify(stableValue(value))).toString(16).padStart(8, "0");
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
