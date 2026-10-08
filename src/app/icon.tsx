import { ImageResponse } from "next/og";
import { ClockMarkSvg } from "@/lib/clock-mark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<ClockMarkSvg size={32} />, { ...size });
}
