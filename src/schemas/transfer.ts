import { z } from "zod";

export const createTransferSchema = z
  .object({
    source_account_id: z
      .string({ message: "source_account_id must be a string" })
      .uuid("Invalid source_account_id format; must be a valid UUID"),
    destination_account_id: z
      .string({ message: "destination_account_id must be a string" })
      .uuid("Invalid destination_account_id format; must be a valid UUID"),
    amount: z
      .string({ message: "amount must be a string" })
      .trim()
      .min(1, "amount is required"),
    description: z
      .string({ message: "description must be a string" })
      .trim()
      .min(1, "description cannot be empty")
      .max(500, "description cannot exceed 500 characters"),
    reference_id: z
      .string({ message: "reference_id must be a string" })
      .trim()
      .min(1, "reference_id cannot be empty")
      .max(128, "reference_id cannot exceed 128 characters"),
  })
  .strict()
  .refine(
    (data) => data.source_account_id !== data.destination_account_id,
    {
      message: "source_account_id and destination_account_id must be distinct",
      path: ["destination_account_id"],
    }
  );

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
