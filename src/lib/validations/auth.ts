import { z } from "zod";
import { strongPasswordSchema } from "@/lib/validations/password";

// First-run setup: the organization plus its local admin (OWNER) account.
export const setupSchema = z.object({
  orgName: z.string().trim().min(2, "Organization name is required").max(120),
  name: z.string().trim().min(2, "Your name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: strongPasswordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const acceptInviteSchema = z.object({
  name: z.string().trim().min(2, "Your name is required").max(120),
  password: strongPasswordSchema,
});
