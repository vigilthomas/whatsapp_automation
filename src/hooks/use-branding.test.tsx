import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { BRANDING_CACHE_KEY } from "@/lib/branding";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BrandingProvider first render", () => {
  it("matches the server (defaults) even when a branding is cached, so pages hydrate cleanly", async () => {
    const store: Record<string, string> = {
      [BRANDING_CACHE_KEY]: JSON.stringify({ branding: { title: "Glow Clinic", logo: "https://x.example/l.png" }, css: "" }),
    };
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: () => {} });
    const { BrandingProvider, useBranding } = await import("./use-branding");
    function Probe() {
      return <span>{useBranding().branding.title ?? "default"}</span>;
    }
    const html = renderToString(
      <BrandingProvider>
        <Probe />
      </BrandingProvider>,
    );
    expect(html).toContain("default");
    expect(html).not.toContain("Glow Clinic");
  });
});
