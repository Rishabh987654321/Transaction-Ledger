import { z } from "zod";
import { ValidationError } from "../errors/app-error.js";

export const createAccountSchema = z
  .object({
    name: z
      .string({
        message: "name must be a string",
      })
      .trim()
      .min(1, "name cannot be empty")
      .max(120, "name cannot exceed 120 characters"),
  })
  .strict();

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const accountIdParamSchema = z
  .object({
    accountId: z
      .string({
        message: "accountId must be a string",
      })
      .uuid("Invalid account ID format; must be a valid UUID"),
  })
  .strict();

export type AccountIdParam = z.infer<typeof accountIdParamSchema>;

export function validateSchema<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => {
      let field: string | undefined;
      if (issue.path.length > 0) {
        field = issue.path.join(".");
      } else if (issue.code === "unrecognized_keys") {
        field = (issue as any).keys?.join(", ");
      }
      return {
        field,
        message: issue.message,
      };
    });
    throw new ValidationError("Validation failed.", details);
  }
  return result.data;
}
