import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return <SignupForm googleEnabled={!!process.env.AUTH_GOOGLE_ID} />;
}
