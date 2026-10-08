// The Consultainer clock mark as plain SVG, with explicit colors, for the
// generated icons (ImageResponse can't read CSS variables). The in-app
// version in components/brand-mark.tsx uses theme tokens instead.
export const MARK_COLORS = { tile: "#18181b", face: "#fafafa", hand: "#34d399" };

export function ClockMarkSvg({ size, rounded = true }: { size: number; rounded?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect width="24" height="24" rx={rounded ? 6 : 0} fill={MARK_COLORS.tile} />
      <circle cx="12" cy="12" r="6.6" fill="none" strokeWidth="1.9" stroke={MARK_COLORS.face} />
      <path d="M12 12V8.4" strokeWidth="1.9" strokeLinecap="round" stroke={MARK_COLORS.face} />
      <path d="M12 12l2.9 1.7" strokeWidth="1.9" strokeLinecap="round" stroke={MARK_COLORS.hand} />
    </svg>
  );
}
