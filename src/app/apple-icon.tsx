import { ImageResponse } from "next/og";
import { ClockMarkSvg } from "@/lib/clock-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS applies its own rounded mask, so the tile is drawn square.
export default function AppleIcon() {
  return new ImageResponse(<ClockMarkSvg size={180} rounded={false} />, { ...size });
}
