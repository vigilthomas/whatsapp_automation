/**
 * Make a search-box string safe to interpolate into a PostgREST
 * `.or("name.ilike.*x*,phone.ilike.*x*")` filter.
 *
 * PostgREST filter strings are comma / parenthesis delimited, so an
 * unsanitised term like `a,id.neq.0` adds a filter clause of its own
 * (security audit F-12). RLS still limited the rows to the caller's
 * account, but the filter grammar is not something user input should
 * reach. Keeps what a name, phone number or email legitimately holds:
 * letters, combining marks (\p{M}: the vowel signs of Malayalam, Hindi,
 * Tamil and other Indic scripts; without them "ജോസഫ്" was searched as
 * "ജസഫ"), digits, space, `+ @ . - _`.
 *
 * Shared by `/api/v1/contacts` and the dashboard's browser-side
 * searches (contacts page, appointment patient picker).
 */
export function sanitizeSearch(raw: string): string {
  return raw.replace(/[^\p{L}\p{M}\p{N} +@.\-_]/gu, "").trim();
}
