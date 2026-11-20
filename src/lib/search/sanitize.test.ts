import { describe, expect, it } from "vitest";
import { sanitizeSearch } from "./sanitize";

describe("sanitizeSearch", () => {
  it("keeps names, phones and emails", () => {
    expect(sanitizeSearch(" Anu Joseph ")).toBe("Anu Joseph");
    expect(sanitizeSearch("+91 98470-12345")).toBe("+91 98470-12345");
    expect(sanitizeSearch("anu.j_1@clinic.in")).toBe("anu.j_1@clinic.in");
    expect(sanitizeSearch("ജോസഫ്")).toBe("ജോസഫ്");
  });

  it("strips PostgREST filter grammar", () => {
    expect(sanitizeSearch("a,id.neq.0")).toBe("aid.neq.0");
    expect(sanitizeSearch("x),or(name.is.null")).toBe("xorname.is.null");
    expect(sanitizeSearch("*\"%\\")).toBe("");
  });
});
