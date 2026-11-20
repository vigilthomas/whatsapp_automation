import { describe, expect, it } from "vitest";
import { isBookableRole, staffTypeFromRole } from "./staff";

describe("isBookableRole", () => {
  it("knows bookable titles across sectors", () => {
    for (const name of ["Doctor", "Dr", "Senior Stylist", "Barber", "Therapist", "Consultant", "Personal trainer"]) {
      expect(isBookableRole(name)).toBe(true);
    }
    for (const name of ["Receptionist", "Admin", "Accountant"]) expect(isBookableRole(name)).toBe(false);
  });

  it("also accepts the install's own staff word", () => {
    expect(isBookableRole("Junior Artisan")).toBe(false);
    expect(isBookableRole("Junior Artisan", ["Artisan", "Artisans"])).toBe(true);
    expect(isBookableRole("Artisanal baker", ["Artisan"])).toBe(false);
    expect(staffTypeFromRole("Head groomer", ["Groomer"])).toBe("doctor");
    expect(staffTypeFromRole("Nurse")).toBe("assistant");
  });
});
