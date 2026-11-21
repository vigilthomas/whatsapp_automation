/**
 * Per-group load failures on the dashboard. A group whose query threw
 * has no data and is no longer loading; without this its cards waited
 * for data forever ("…" / spinner). Cards that need a failed group show
 * "Couldn't load" instead.
 */
export function cardFailed(groups: readonly string[], failed: ReadonlySet<string>): boolean {
  return groups.some((g) => failed.has(g))
}
