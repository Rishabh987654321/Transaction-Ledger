import { z } from "zod";

const MAX_PAGE = 100_000;

/**
 * Validates integer query parameters like page and limit from query strings.
 */
export const integerQueryParam = (
  name: string,
  min: number,
  max?: number,
  defaultValue?: number
) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((val, ctx) => {
      if (val === undefined || val === null || val === "") {
        return defaultValue as number;
      }
      const str = String(val).trim();
      // Ensure purely digits (no decimals, signs, or exponents)
      if (!/^\d+$/.test(str)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${name} must be a positive integer`,
        });
        return z.NEVER;
      }
      const num = Number(str);
      if (!Number.isSafeInteger(num) || num < min || (max !== undefined && num > max)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            max !== undefined
              ? `${name} must be an integer between ${min} and ${max}`
              : `${name} must be a safe integer greater than or equal to ${min}`,
        });
        return z.NEVER;
      }
      return num;
    });

export const listTransactionsQuerySchema = z
  .object({
    type: z
      .enum(["credit", "debit"], {
        message: "type must be either 'credit' or 'debit'",
      })
      .optional(),
    page: integerQueryParam("page", 1, MAX_PAGE, 1),
    limit: integerQueryParam("limit", 1, 100, 20),
  })
  .strict();

export type ListTransactionsQuery = z.infer<
  typeof listTransactionsQuerySchema
>;
