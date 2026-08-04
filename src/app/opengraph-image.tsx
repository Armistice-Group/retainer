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
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #8b6cf7, #6c3ff2)",
            color: "#ffffff",
            fontSize: 72,
            fontWeight: 700,
            marginBottom: 36,
          }}
        >
          C
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: "#f4f2fb" }}>
          Consultainer
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#a79fc2", marginTop: 16 }}>
          Client, project, and billing management for engineering consultants
        </div>
      </div>
    ),
    { ...size }
  );
}
