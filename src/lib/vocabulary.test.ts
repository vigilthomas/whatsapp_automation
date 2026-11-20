import { describe, expect, it } from "vitest";
import { applyVocabulary, fillTerms, parseVocabulary, resolveTerms } from "./vocabulary";

const clinic = resolveTerms({ sector: "clinic" });
const salon = resolveTerms({ sector: "salon" });
const agency = resolveTerms({ sector: "agency" });

describe("fillTerms", () => {
  it("fills singular, plural and capitalised forms", () => {
    expect(fillTerms("Search [[customers]] or [[bookings]]", clinic)).toBe("Search patients or appointments");
    expect(fillTerms("[[Staff]] availability", salon)).toBe("Stylist availability");
    expect(fillTerms("All [[staffs]]", agency)).toBe("All consultants");
    expect(fillTerms("[[Business]] settings", agency)).toBe("Agency settings");
  });

  it("picks the English article from the word", () => {
    expect(fillTerms("Book [[a:booking]]", clinic)).toBe("Book an appointment");
    expect(fillTerms("Book [[a:booking]]", agency)).toBe("Book a meeting");
    expect(fillTerms("[[a:Customer]] is waiting", clinic)).toBe("A patient is waiting");
  });

  it("fills the app name and leaves unknown tokens and ICU alone", () => {
    expect(fillTerms("Delete from [[app]]", clinic, "SalonPro")).toBe("Delete from SalonPro");
    expect(fillTerms("[[nope]] {count, plural, one {# [[booking]]} other {# [[bookings]]}}", clinic)).toBe(
      "[[nope]] {count, plural, one {# appointment} other {# appointments}}",
    );
  });

  it("keeps acronyms as typed", () => {
    const t = resolveTerms({ sector: "clinic", terms: { staff: { one: "GP", many: "GPs" } } });
    expect(fillTerms("Pick [[a:staff]]", t)).toBe("Pick a GP");
  });

  it("picks the Korean particle for the word", () => {
    const ko = (sector: "clinic" | "salon") => resolveTerms({ sector }, "ko");
    expect(fillTerms("[[customer]]를 선택", ko("clinic"))).toBe("환자를 선택");
    expect(fillTerms("[[customer]]를 선택", ko("salon"))).toBe("고객을 선택");
    expect(fillTerms("[[staff]]이 없습니다", ko("clinic"))).toBe("의사가 없습니다");
    expect(fillTerms("[[customer]] 이름", ko("salon"))).toBe("고객 이름");
  });

  it("uses Korean presets without articles", () => {
    expect(fillTerms("[[a:customer]] 검색", resolveTerms({ sector: "salon" }, "ko"))).toBe("고객 검색");
  });
});

describe("resolveTerms / parseVocabulary", () => {
  it("overrides on top of the preset; plural follows singular when missing", () => {
    const t = resolveTerms({ sector: "salon", terms: { staff: { one: "Barber" } } });
    expect(t.staff).toEqual({ one: "Barber", many: "Barber" });
    expect(t.customer.one).toBe("Client");
  });

  it("whitelists stored values", () => {
    expect(parseVocabulary({ sector: "spa", terms: { staff: { one: " Therapist[[x]] ", many: 3 }, junk: {} } })).toEqual({
      terms: { staff: { one: "Therapistx" } },
    });
    expect(parseVocabulary(null)).toEqual({});
  });

  it("fills a whole messages tree", () => {
    expect(applyVocabulary({ a: { b: "[[Customers]]" }, c: ["[[staff]]"] }, clinic)).toEqual({
      a: { b: "Patients" },
      c: ["doctor"],
    });
  });
});
