"use server";

import { contactFormSchema } from "@/lib/validations/contact";
import { sendEmail } from "@/lib/email";
import { ContactInquiryEmail } from "@/emails/contact-inquiry-email";
import { getOrigin } from "@/lib/url";
import { isAttioConfigured, syncAttioContact } from "@/lib/attio";

const CONTACT_INBOX = "support@consultainer.app";

export type ContactFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  submitted?: boolean;
} | null;

export async function submitContactFormAction(
  _prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  // Honeypot — real users never fill in a field named "website" that's
  // hidden with CSS; bots filling every field in a scraped form do.
  if (formData.get("website")) {
    return { submitted: true };
  }

  const parsed = contactFormSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    company: formData.get("company"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const origin = await getOrigin();

  try {
    await sendEmail({
      to: CONTACT_INBOX,
      subject: `Contact form: ${parsed.data.name}${parsed.data.company ? ` (${parsed.data.company})` : ""}`,
      replyTo: parsed.data.email,
      react: ContactInquiryEmail({
        name: parsed.data.name,
        email: parsed.data.email,
        company: parsed.data.company || null,
        message: parsed.data.message,
        origin,
      }),
    });
  } catch (err) {
    console.warn("[contact] Failed to send inquiry email", err);
    return { error: "Something went wrong sending your message. Please email us directly." };
  }

  if (isAttioConfigured()) {
    await syncAttioContact({
      name: parsed.data.name,
      email: parsed.data.email,
      company: parsed.data.company || null,
    });
  }

  return { submitted: true };
}
