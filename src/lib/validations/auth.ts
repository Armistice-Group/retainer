import { z } from "zod";

export const signupSchema = z.object({
  orgName: z.string().trim().min(2, "Organization name is required").max(120),
  name: z.string().trim().min(2, "Your name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(2, "Your name is required").max(120),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});
