# 12 — Dependency and supply-chain security

`npm audit --omit=dev --json` on 20 Nov 2026: **23 advisories (2 critical, 11 high, 10 moderate)**. No packages were installed or changed during the audit.

| Package (installed via) | Range | Severity | Advisory (summary) | Reachable in this app? | Action |
|---|---|---|---|---|---|
| **next** 16.2.12 (direct) | ≤16.4.4 | Critical | Unauthenticated RCE on Windows-hosted servers (CVE-2026-75604); AVIF image optimisation RCE (GHSA-2xp9-vwfh-vxw4); Oct 2026 critical fixes | **Potential**: Windows only matters if hosted on Windows (dev machine is); AVIF not configured; Oct issues depend on platform | **Upgrade now** (F-02) |
| proxy-addr (via express ← shadcn ← MCP SDK) | 1.1.0–2.0.7 | Critical | IP spoofing via IPv4-mapped IPv6 | Not at runtime (CLI dependency chain) | Move `shadcn` to dev |
| @modelcontextprotocol/sdk (via shadcn) | ≤1.31.0 | High | OAuth credential misdirection | No | same |
| body-parser, qs, express-rate-limit, hono, @hono/node-server (via shadcn/MCP) | various | High/Mod | DoS, path bypass | No | same |
| undici | 7.0–7.30 | High | DoS in WebSocket decompression | Possibly (Node fetch internals): low | Update |
| sharp | ≤0.35.5-rc.1 | High | libheif/librsvg vulnerabilities | Used by Next image optimisation if installed: **requires verification** | Update with `next` |
| zod (via shadcn) | <4.6.6 | High | Memory exhaustion | No (app doesn't use zod for request validation) | dev move |
| fast-uri, js-yaml, brace-expansion, minimatch, browserslist, source-map-js, postcss-selector-parser, baseline-browser-mapping, ts-morph | various | High/Mod | DoS / SSRF in libs | Build-time | Update lockfile |

## Supply-chain observations

- `shadcn` (a code-generator CLI) is listed in **`dependencies`**, which drags express, hono, the MCP SDK and ts-morph into the production install and image. Moving it to `devDependencies` removes most of the advisories above (F-09).
- `opus-recorder` worker files are vendored into `public/opus/` (minified). Pin and record their checksum.
- Dependabot is active (46 commits) ✅. Add `npm audit --omit=dev --audit-level=high` to CI.
- No `postinstall` scripts in direct dependencies were found in `package.json`. Transitive scripts weren't reviewed.
- Typosquatting: direct dependency names checked by eye. All are well-known packages ✅.

Status legend: *Confirmed vulnerable version* = all rows; *Not exploitable in current usage* = CLI-chain rows; *Requires verification* = sharp/undici runtime paths.
