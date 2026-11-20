/**
 * Business vocabulary — what this install calls its business, customers,
 * staff and bookings (Settings → Branding → Business type, migration 064).
 *
 * The product is sold to clinics, salons, agencies and others from one
 * codebase, so no UI string may say "patient" or "doctor" outright. The
 * message files (`messages/*.json`) carry tokens instead:
 *
 *   [[customer]]   [[customers]]   lower case, singular / plural
 *   [[Customer]]   [[Customers]]   capitalised
 *   [[a:customer]]                 with the right English article ("an appointment")
 *   [[app]]                        the install's own name (Branding → name)
 *   [[product]]                    the software's name (NEXT_PUBLIC_APP_NAME)
 *
 * for each of `business`, `customer`, `staff`, `booking`. `applyVocabulary`
 * fills them in once, when the messages are handed to next-intl (see
 * `VocabularyIntlProvider`), so components keep calling `t()` as before.
 * Server-side text the customer sees (WhatsApp booking replies, the AI
 * prompt) goes through `fillTerms` too.
 *
 * A sector is only a preset: every word can be overridden. Unknown or
 * empty values fall back to the preset, and an unknown sector to the
 * install default (`NEXT_PUBLIC_APP_SECTOR`, else "clinic", which keeps
 * existing installs looking exactly as before).
 */

export const TERM_KEYS = ["business", "customer", "staff", "booking"] as const;
export type TermKey = (typeof TERM_KEYS)[number];

export interface Term {
  one: string;
  many: string;
}
export type Terms = Record<TermKey, Term>;

export const SECTORS = ["clinic", "salon", "agency", "general"] as const;
export type Sector = (typeof SECTORS)[number];

/** What's stored on `app_branding.vocabulary`. */
export interface Vocabulary {
  sector?: Sector;
  terms?: Partial<Record<TermKey, Partial<Term>>>;
}

export const TERM_MAX = 40;

const PRESETS: Record<"en" | "ko", Record<Sector, Terms>> = {
  en: {
    clinic: {
      business: { one: "Clinic", many: "Clinics" },
      customer: { one: "Patient", many: "Patients" },
      staff: { one: "Doctor", many: "Doctors" },
      booking: { one: "Appointment", many: "Appointments" },
    },
    salon: {
      business: { one: "Salon", many: "Salons" },
      customer: { one: "Client", many: "Clients" },
      staff: { one: "Stylist", many: "Stylists" },
      booking: { one: "Appointment", many: "Appointments" },
    },
    agency: {
      business: { one: "Agency", many: "Agencies" },
      customer: { one: "Client", many: "Clients" },
      staff: { one: "Consultant", many: "Consultants" },
      booking: { one: "Meeting", many: "Meetings" },
    },
    general: {
      business: { one: "Business", many: "Businesses" },
      customer: { one: "Customer", many: "Customers" },
      staff: { one: "Staff member", many: "Staff" },
      booking: { one: "Booking", many: "Bookings" },
    },
  },
  ko: {
    clinic: {
      business: { one: "클리닉", many: "클리닉" },
      customer: { one: "환자", many: "환자" },
      staff: { one: "의사", many: "의사" },
      booking: { one: "예약", many: "예약" },
    },
    salon: {
      business: { one: "살롱", many: "살롱" },
      customer: { one: "고객", many: "고객" },
      staff: { one: "스타일리스트", many: "스타일리스트" },
      booking: { one: "예약", many: "예약" },
    },
    agency: {
      business: { one: "에이전시", many: "에이전시" },
      customer: { one: "클라이언트", many: "클라이언트" },
      staff: { one: "컨설턴트", many: "컨설턴트" },
      booking: { one: "미팅", many: "미팅" },
    },
    general: {
      business: { one: "비즈니스", many: "비즈니스" },
      customer: { one: "고객", many: "고객" },
      staff: { one: "직원", many: "직원" },
      booking: { one: "예약", many: "예약" },
    },
  },
};

export const DEFAULT_APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Clinicoro";

export function isSector(v: unknown): v is Sector {
  return typeof v === "string" && (SECTORS as readonly string[]).includes(v);
}

/** The install default sector (env), else clinic. */
export function defaultSector(): Sector {
  const env = process.env.NEXT_PUBLIC_APP_SECTOR;
  return isSector(env) ? env : "clinic";
}

/** Preset words for a sector in a locale (English for unknown locales). */
export function presetTerms(sector: Sector, locale = "en"): Terms {
  return (locale === "ko" ? PRESETS.ko : PRESETS.en)[sector];
}

const clean = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[\u0000-\u001f[\]{}<>]/g, "").trim().slice(0, TERM_MAX);
  return s || undefined;
};

/** Whitelist what the database (or a request body) holds. */
export function parseVocabulary(raw: unknown): Vocabulary {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: Vocabulary = {};
  if (isSector(r.sector)) out.sector = r.sector;
  if (r.terms && typeof r.terms === "object" && !Array.isArray(r.terms)) {
    const terms: Vocabulary["terms"] = {};
    for (const key of TERM_KEYS) {
      const t = (r.terms as Record<string, unknown>)[key];
      if (!t || typeof t !== "object") continue;
      const one = clean((t as Record<string, unknown>).one);
      const many = clean((t as Record<string, unknown>).many);
      if (one || many) terms[key] = { ...(one ? { one } : {}), ...(many ? { many } : {}) };
    }
    if (Object.keys(terms).length) out.terms = terms;
  }
  return out;
}

/** The words to show: the sector preset with any overrides on top. */
export function resolveTerms(vocab: Vocabulary | null | undefined, locale = "en"): Terms {
  const preset = presetTerms(vocab?.sector ?? defaultSector(), locale);
  const out = {} as Terms;
  for (const key of TERM_KEYS) {
    const o = vocab?.terms?.[key];
    out[key] = { one: o?.one || preset[key].one, many: o?.many || o?.one || preset[key].many };
  }
  return out;
}

const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/**
 * A word as typed is kept as typed when the user capitalised it
 * mid-word ("SpaCare", "GP"); otherwise a lower-case token lower-cases
 * the first letter only, so "Hair stylist" reads "hair stylist".
 */
function caseFor(word: string, capital: boolean): string {
  if (capital) return upperFirst(word);
  return /^[A-Z]{2,}/.test(word) ? word : lowerFirst(word);
}

const TOKEN_RE = /\[\[(a:)?([A-Za-z]+)\]\](을|를|이|가|은|는|와|과)?/g;

/** Korean particle pairs: [after a final consonant, after a vowel]. */
const PARTICLES: Record<string, [string, string]> = {
  을: ["을", "를"], 를: ["을", "를"],
  이: ["이", "가"], 가: ["이", "가"],
  은: ["은", "는"], 는: ["은", "는"],
  과: ["과", "와"], 와: ["과", "와"],
};

/** The particle that fits after `word` (Korean has no articles but its particles follow the last sound). */
function particleAfter(word: string, particle: string): string {
  const pair = PARTICLES[particle];
  const last = word.charCodeAt(word.length - 1);
  if (!pair || last < 0xac00 || last > 0xd7a3) return particle;
  return (last - 0xac00) % 28 !== 0 ? pair[0] : pair[1];
}
const KEY_BY_TOKEN: Record<string, { key: TermKey; plural: boolean }> = {
  business: { key: "business", plural: false },
  businesses: { key: "business", plural: true },
  customer: { key: "customer", plural: false },
  customers: { key: "customer", plural: true },
  staff: { key: "staff", plural: false },
  staffs: { key: "staff", plural: true },
  booking: { key: "booking", plural: false },
  bookings: { key: "booking", plural: true },
};

/** Fill every `[[token]]` in one string. Unknown tokens are left as they are. */
export function fillTerms(text: string, terms: Terms, appName: string = DEFAULT_APP_NAME): string {
  if (!text.includes("[[")) return text;
  return text.replace(TOKEN_RE, (whole, article: string | undefined, name: string, particle: string | undefined) => {
    const tail = (word: string) => (particle ? particleAfter(word, particle) : "");
    if (name === "app") return appName + tail(appName);
    if (name === "product") return DEFAULT_APP_NAME + tail(DEFAULT_APP_NAME);
    const hit = KEY_BY_TOKEN[name.toLowerCase()];
    if (!hit) return whole;
    const capital = name.charAt(0) === name.charAt(0).toUpperCase();
    const raw = hit.plural ? terms[hit.key].many : terms[hit.key].one;
    const word = caseFor(raw, capital);
    if (!article) return word + tail(word);
    // English article: "an" before a vowel sound we can see. Other
    // scripts have no article, so the word stands alone.
    if (!/^[A-Za-z]/.test(word)) return word + tail(word);
    const an = /^[aeiou]/i.test(word);
    const art = an ? "an" : "a";
    return `${capital ? upperFirst(art) : art} ${capital ? lowerFirst(word) : word}`;
  });
}

/** Deep copy of a messages tree with every string's tokens filled in. */
export function applyVocabulary<T>(messages: T, terms: Terms, appName: string = DEFAULT_APP_NAME): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return fillTerms(v, terms, appName);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return walk(messages) as T;
}
