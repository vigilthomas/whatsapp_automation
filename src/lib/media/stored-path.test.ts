import { describe, expect, it } from "vitest";
import { storedMediaPath } from "./stored-path";
import { storedMediaUrl, MIRROR_BUCKET } from "@/lib/whatsapp/mirror-inbound-media";
import { isProxiedMediaUrl } from "./blob-cache";

const A = "11111111-2222-3333-4444-555555555555";
const B = "99999999-8888-7777-6666-555555555555";

describe("storedMediaPath", () => {
  it("accepts a file inside the caller's own folder", () => {
    expect(storedMediaPath([`account-${A}`, "inbound", "123-photo.jpg"], A)).toBe(
      `account-${A}/inbound/123-photo.jpg`,
    );
  });

  it("rejects another account's folder", () => {
    expect(storedMediaPath([`account-${B}`, "inbound", "x.jpg"], A)).toBeNull();
  });

  it("rejects traversal and malformed segments", () => {
    expect(storedMediaPath([`account-${A}`, "..", `account-${B}`, "x.jpg"], A)).toBeNull();
    expect(storedMediaPath([`account-${A}`, "%2e%2e", "x.jpg"], A)).toBeNull();
    expect(storedMediaPath([`account-${A}`, "a%2Fb.jpg"], A)).toBeNull();
    expect(storedMediaPath([`account-${A}`, "a%5Cb.jpg"], A)).toBeNull();
    expect(storedMediaPath([`account-${A}`, "%E0%A4%A"], A)).toBeNull();
    expect(storedMediaPath([`account-${A}`, ""], A)).toBeNull();
  });

  it("rejects a bare folder or no account", () => {
    expect(storedMediaPath([`account-${A}`], A)).toBeNull();
    expect(storedMediaPath(undefined, A)).toBeNull();
    expect(storedMediaPath([`account-`, "x.jpg"], "")).toBeNull();
  });

  it("round-trips the URL the mirror stores", () => {
    const path = `account-${A}/inbound/123-my report.pdf`;
    const url = storedMediaUrl(path);
    expect(isProxiedMediaUrl(url)).toBe(true);
    const segments = url.replace("/api/whatsapp/media/stored/", "").split("/");
    expect(storedMediaPath(segments, A)).toBe(path);
  });

  it("mirrors into the private bucket", () => {
    expect(MIRROR_BUCKET).toBe("patient-media");
  });
});
