import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#100e16",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 120,
            height: 120,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            background: "#4f6df5",
            color: "#ffffff",
            fontSize: 68,
            fontWeight: 700,
            fontFamily: "monospace",
            marginBottom: 36,
          }}
        >
          C
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, fontFamily: "monospace", color: "#f4f2fb" }}>
          Consultainer
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#a79fc2", marginTop: 16 }}>
          Built to ship engagements, not manage them
        </div>
      </div>
    ),
    { ...size }
  );
}
