import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderError, checkBaseUrl, complete } from "./provider";

describe("checkBaseUrl", () => {
  it("accepts local and LAN Ollama addresses, cleaned", () => {
    expect(checkBaseUrl("http://localhost:11434/")).toBe("http://localhost:11434");
    expect(checkBaseUrl(" http://192.168.1.20:11434/v1 ")).toBe("http://192.168.1.20:11434");
    expect(checkBaseUrl("https://ollama.example.com/proxy/")).toBe("https://ollama.example.com/proxy");
  });

  it("refuses metadata addresses, credentials, other schemes and junk", () => {
    for (const bad of [
      "http://169.254.169.254/latest",
      "http://metadata.google.internal",
      "http://[fd00:ec2::254]",
      "http://user:pw@localhost:11434",
      "file:///etc/passwd",
      "ftp://host",
      "http://host/?x=1",
      "not a url",
      "",
      42,
      `http://h/${"a".repeat(300)}`,
    ]) {
      expect(checkBaseUrl(bad)).toBeNull();
    }
  });
});

describe("complete (OpenAI-compatible providers)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const ok = (content: string) =>
    vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));

  it("calls Groq with the key and JSON mode", async () => {
    const fetchMock = ok('{"reply":"hi"}');
    vi.stubGlobal("fetch", fetchMock);
    const out = await complete({ provider: "groq", model: "m", apiKey: "gsk_x", system: "s", turns: [{ role: "user", content: "q" }] });
    expect(out).toBe('{"reply":"hi"}');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer gsk_x");
    expect(JSON.parse(String(init.body)).response_format).toEqual({ type: "json_object" });
  });

  it("calls NVIDIA without JSON mode", async () => {
    const fetchMock = ok("x");
    vi.stubGlobal("fetch", fetchMock);
    await complete({ provider: "nvidia", model: "m", apiKey: "nvapi-x", system: "s", turns: [] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(JSON.parse(String(init.body)).response_format).toBeUndefined();
  });

  it("calls a local Ollama server at its address, with no key and no redirects", async () => {
    const fetchMock = ok("x");
    vi.stubGlobal("fetch", fetchMock);
    await complete({ provider: "ollama", model: "llama3.2", apiKey: "", baseUrl: "http://10.0.0.5:11434", system: "s", turns: [] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://10.0.0.5:11434/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
    expect(init.redirect).toBe("error");
  });

  it("refuses a bad Ollama address and reports provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      complete({ provider: "ollama", model: "m", apiKey: "", baseUrl: "http://169.254.169.254", system: "s", turns: [] }),
    ).rejects.toBeInstanceOf(AiProviderError);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "model not found" }), { status: 404 })));
    await expect(
      complete({ provider: "ollama", model: "m", apiKey: "", baseUrl: "http://localhost:11434", system: "s", turns: [] }),
    ).rejects.toThrow("Ollama 404: model not found");
  });
});
