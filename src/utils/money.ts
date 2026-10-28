import { ValidationError } from "../errors/app-error.js";

const MAX_BIGINT_64 = 9223372036854775807n;

/**
 * Converts minor currency units (paise/cents) represented as a BigInt
 * into an exact two-decimal string representation (e.g. "125.50" or "0.00")
 * without using JavaScript floating-point arithmetic.
 */
export function minorToDecimalString(minor: bigint): string {
  const isNegative = minor < 0n;
  const abs = isNegative ? -minor : minor;
  const whole = (abs / 100n).toString();
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${isNegative ? "-" : ""}${whole}.${frac}`;
}

/**
 * Converts a validated decimal currency string into minor currency units (BigInt)
 * without using JavaScript floating-point arithmetic (no parseFloat, no Number).
 * Rejects negative amounts, zero, NaN, exponents, excess decimal places,
 * and values exceeding PostgreSQL 64-bit integer limits.
 */
export function decimalStringToMinor(val: string): bigint {
  if (typeof val !== "string") {
    throw new ValidationError("amount must be a string", [
      { field: "amount", message: "amount must be a string" },
    ]);
  }

  const trimmed = val.trim();

  // Pattern: positive whole number or decimal with 1 or 2 fractional digits
  // Disallows leading zeroes except for "0.xx"
  const pattern = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
  if (!pattern.test(trimmed)) {
    throw new ValidationError(
      "amount must be a positive decimal string with at most two decimal places",
      [
        {
          field: "amount",
          message:
            "amount must be a positive decimal string with at most two decimal places",
        },
      ]
    );
  }

  const parts = trimmed.split(".");
  const wholePart = parts[0];
  const fracPart = (parts[1] || "").padEnd(2, "0");

  const whole = BigInt(wholePart);
  const frac = BigInt(fracPart);
  const minor = whole * 100n + frac;

  if (minor <= 0n) {
    throw new ValidationError("amount must be greater than zero", [
      { field: "amount", message: "amount must be greater than zero" },
    ]);
  }

  if (minor > MAX_BIGINT_64) {
    throw new ValidationError("amount exceeds maximum allowed limit", [
      { field: "amount", message: "amount exceeds maximum allowed limit" },
    ]);
  }

  return minor;
}
