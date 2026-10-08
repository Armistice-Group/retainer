import { ImageResponse } from "next/og";
import { ClockMarkSvg } from "@/lib/clock-mark";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Link-preview card (e.g. when a share link is pasted into Slack).
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          background: "#09090b",
          fontFamily: "sans-serif",
        }}
      >
        <ClockMarkSvg size={140} />
        <div style={{ display: "flex", fontSize: 88, fontWeight: 700, color: "#fafafa", letterSpacing: -2 }}>
          Consultainer
        </div>
      </div>
    ),
    { ...size }
  );
}
