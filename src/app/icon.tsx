import { ImageResponse } from "next/og";

// Replaces the default Next.js favicon with the AutoShift mark — green
// rounded square + white double chevron — matching LogoMark
// (`src/components/brand/logo-mark.tsx`) and the public site's favicon. Next.js renders
// this at build time and auto-injects <link rel="icon"> into <head>.
//
// This route takes precedence over src/app/favicon.ico, which is the
// Next.js default and can stay on disk harmlessly (or be removed).

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

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
          background: "#1E4C41", // AutoShift green
          borderRadius: 7,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 64 64">
          <path
            d="M18 36l14-14 14 14M18 50l14-14 14 14"
            fill="none"
            stroke="#ffffff"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
