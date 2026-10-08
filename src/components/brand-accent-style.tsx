import { brandAccentCss } from "@/lib/branding";

/** Swaps the UI accent for an org's brand color, when it opted in. */
export function BrandAccentStyle({ color }: { color: string | null | undefined }) {
  const css = brandAccentCss(color);
  return css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null;
}
