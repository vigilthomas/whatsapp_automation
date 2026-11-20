/**
 * Validate the path segments of `/api/whatsapp/media/stored/<...>` and
 * turn them back into a `patient-media` object path.
 *
 * Returns null unless:
 *   - the first segment is exactly the caller's `account-<accountId>`
 *     folder (security audit F-01: one account must never read another's
 *     patient media, even if Storage RLS were misconfigured), and
 *   - no segment is empty, `.`, `..`, or contains a slash or backslash
 *     after URL decoding (no traversal out of the folder).
 *
 * Pure, so the rules are unit-tested without a request or Storage.
 */
export function storedMediaPath(
  segments: readonly string[] | undefined,
  accountId: string,
): string | null {
  if (!segments || segments.length < 2 || !accountId) return null;

  const decoded: string[] = [];
  for (const raw of segments) {
    let seg: string;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (!seg || seg === "." || seg === ".." || /[\\/\0]/.test(seg)) {
      return null;
    }
    decoded.push(seg);
  }

  if (decoded[0] !== `account-${accountId}`) return null;
  return decoded.join("/");
}
