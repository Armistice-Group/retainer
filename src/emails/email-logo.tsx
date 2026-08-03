import { Img } from "@react-email/components";

export function EmailLogo({ origin }: { origin: string }) {
  return (
    <Img
      src={`${origin}/apple-icon`}
      width="40"
      height="40"
      alt="Consultainer"
      style={{ borderRadius: 9, marginBottom: 20 }}
    />
  );
}
