import { ImageResponse } from "next/og";
import {
  LOGO_ARC_PATH,
  LOGO_GRADIENT,
  LOGO_VIEWBOX,
} from "@/components/brand/logo";

// Favicon — the Clinicoro mark (open "C" + plus on a teal → green
// gradient), matching the sidebar / auth-card logo rendered by
// `src/components/brand/logo.tsx`. Next.js renders this at build time
// and auto-injects <link rel="icon"> into <head>.
//
// The mark is handed to ImageResponse as an <img> with an SVG data URI
// rather than inline <svg> JSX: Satori (the JSX → SVG layer) only
// understands a subset of SVG, and gradients are outside it, whereas
// an <img> is rasterised by resvg, which handles the full spec. The
// geometry comes from the same constants the React component uses, so
// the two can't drift.

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}" fill="none">
  <defs>
    <linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="${LOGO_GRADIENT.from}"/>
      <stop offset="1" stop-color="${LOGO_GRADIENT.to}"/>
    </linearGradient>
  </defs>
  <path d="${LOGO_ARC_PATH}" stroke="url(#g)" stroke-width="11" stroke-linecap="round"/>
  <rect x="62" y="44.5" width="32" height="11" rx="4" fill="url(#g)"/>
  <rect x="72.5" y="34" width="11" height="32" rx="4" fill="url(#g)"/>
</svg>`;

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Solid white keeps the gradient legible on dark browser
          // chrome, where a transparent favicon would lose the teal.
          background: "#ffffff",
          borderRadius: 6,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
          width={28}
          height={28}
          alt=""
        />
      </div>
    ),
    { ...size },
  );
}
