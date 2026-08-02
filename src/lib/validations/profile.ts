import { z } from "zod";
import { strongPasswordSchema } from "@/lib/validations/password";

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
});

export const changeEmailSchema = z.object({
  newEmail: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().optional().or(z.literal("")),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
