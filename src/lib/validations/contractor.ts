import { z } from "zod";

export const contractorProfileSchema = z.object({
  title: z.string().trim().max(150).optional().or(z.literal("")),
  bio: z.string().trim().max(4000).optional().or(z.literal("")),
});
