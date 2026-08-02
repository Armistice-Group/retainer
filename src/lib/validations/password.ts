import { z } from "zod";

export const strongPasswordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200)
  .regex(/[a-zA-Z]/, "Password must include a letter")
  .regex(/[0-9]/, "Password must include a number");
