import { z } from "zod";

export const createTransactionSchema = z
  .object({
    type: z.enum(["credit", "debit"], {
      message: "type must be either 'credit' or 'debit'",
    }),
    amount: z
      .string({
        message: "amount must be a string",
      })
      .trim()
      .min(1, "amount is required"),
    description: z
      .string({
        message: "description must be a string",
      })
      .trim()
      .min(1, "description cannot be empty")
      .max(500, "description cannot exceed 500 characters"),
    reference_id: z
      .string({
        message: "reference_id must be a string",
      })
      .trim()
      .min(1, "reference_id cannot be empty")
      .max(128, "reference_id cannot exceed 128 characters"),
  })
  .strict();

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
