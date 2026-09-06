import { z } from "zod";

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters").max(200),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export const createAppointmentSchema = z
  .object({
    spaceId: z.string().min(1, "Choose a space"),
    title: z.string().trim().min(2, "Add a short title").max(120),
    // Raw values from <input type="datetime-local"> (office-local, zone-less).
    startsAtLocal: z.string().min(1, "Choose a start time"),
    endsAtLocal: z.string().min(1, "Choose an end time"),
  })
  .refine((d) => d.endsAtLocal > d.startsAtLocal, {
    message: "End time must be after the start time",
    path: ["endsAtLocal"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
