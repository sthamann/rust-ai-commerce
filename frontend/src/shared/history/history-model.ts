/** Bounded structural changes for database snapshots; no HTML from historical content is executed. */
export type Change = { path: string; before: unknown; after: unknown };
export function changes(
  before: unknown,
  after: unknown,
  path = "",
  out: Change[] = [],
): Change[] {
  if (out.length >= 300 || JSON.stringify(before) === JSON.stringify(after))
    return out;
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  if (Array.isArray(before) && Array.isArray(after)) {
    for (
      let i = 0;
      i < Math.max(before.length, after.length) && out.length < 300;
      i++
    ) {
      changes(before[i], after[i], `${path}[${i}]`, out);
    }
  } else if (object(before) && object(after)) {
    for (const key of new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ])) {
      if (["updated_at", "created_at", "revision"].includes(key)) continue;
      changes(before[key], after[key], path ? `${path}.${key}` : key, out);
    }
  } else out.push({ path: path || "—", before, after });
  return out;
}
export function printable(value: unknown): string {
  return value == null
    ? "—"
    : typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2);
}
