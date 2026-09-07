import { z } from "zod";

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Ingresá tu nombre")
      .max(80, "El nombre es demasiado largo"),
    email: z.string().trim().toLowerCase().email("Ingresá un correo válido"),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres")
      .max(200, "La contraseña es demasiado larga"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ingresá un correo válido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

const optionalString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v : undefined),
  z.string().optional(),
);

export const createAppointmentSchema = z
  .object({
    spaceId: z.string().min(1, "Elegí un espacio"),
    title: z
      .string()
      .trim()
      .min(2, "Agregá un título breve")
      .max(120, "El título es demasiado largo"),
    // Raw values from <input type="datetime-local"> (office-local, zone-less).
    startsAtLocal: z.string().min(1, "Elegí una hora de inicio"),
    endsAtLocal: z.string().min(1, "Elegí una hora de fin"),
    // Recurrence (optional). "" from an unset <select>/<input> becomes undefined.
    frequency: z.preprocess(
      (v) => (v === "WEEKLY" || v === "MONTHLY" ? v : undefined),
      z.enum(["WEEKLY", "MONTHLY"]).optional(),
    ),
    repeatUntil: optionalString, // "yyyy-MM-dd" from <input type="date">
  })
  .refine((d) => d.endsAtLocal > d.startsAtLocal, {
    message: "La hora de fin debe ser posterior a la de inicio",
    path: ["endsAtLocal"],
  })
  .refine((d) => !d.frequency || !!d.repeatUntil, {
    message: "Elegí hasta cuándo se repite",
    path: ["repeatUntil"],
  })
  .refine(
    (d) => !d.repeatUntil || d.repeatUntil >= d.startsAtLocal.slice(0, 10),
    {
      message: "La fecha de fin de la repetición es anterior al inicio",
      path: ["repeatUntil"],
    },
  );

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
