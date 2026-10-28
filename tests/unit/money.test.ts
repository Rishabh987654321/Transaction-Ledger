import { describe, it, expect } from "vitest";
import {
  minorToDecimalString,
  decimalStringToMinor,
} from "../../src/utils/money.js";
import { ValidationError } from "../../src/errors/app-error.js";

describe("minorToDecimalString", () => {
  it("formats zero as 0.00", () => {
    expect(minorToDecimalString(0n)).toBe("0.00");
  });

  it("formats 1 paise as 0.01", () => {
    expect(minorToDecimalString(1n)).toBe("0.01");
  });

  it("formats 99 paise as 0.99", () => {
    expect(minorToDecimalString(99n)).toBe("0.99");
  });

  it("formats 100 paise as 1.00", () => {
    expect(minorToDecimalString(100n)).toBe("1.00");
  });

  it("formats 12550 paise as 125.50", () => {
    expect(minorToDecimalString(12550n)).toBe("125.50");
  });

  it("handles large amounts without floating-point precision loss", () => {
    const largeMinor = 900719925474099512n; // Exceeds Number.MAX_SAFE_INTEGER
    expect(minorToDecimalString(largeMinor)).toBe("9007199254740995.12");
  });
});

describe("decimalStringToMinor", () => {
  it("converts whole number string", () => {
    expect(decimalStringToMinor("10")).toBe(1000n);
    expect(decimalStringToMinor("1")).toBe(100n);
  });

  it("converts decimal with two places", () => {
    expect(decimalStringToMinor("125.50")).toBe(12550n);
    expect(decimalStringToMinor("0.01")).toBe(1n);
    expect(decimalStringToMinor("0.99")).toBe(99n);
  });

  it("converts decimal with one place", () => {
    expect(decimalStringToMinor("10.5")).toBe(1050n);
    expect(decimalStringToMinor("0.5")).toBe(50n);
  });

  it("rejects zero and negative amounts", () => {
    expect(() => decimalStringToMinor("0")).toThrow(ValidationError);
    expect(() => decimalStringToMinor("0.00")).toThrow(ValidationError);
    expect(() => decimalStringToMinor("-10.00")).toThrow(ValidationError);
  });

  it("rejects excess decimal precision", () => {
    expect(() => decimalStringToMinor("10.555")).toThrow(ValidationError);
    expect(() => decimalStringToMinor("0.001")).toThrow(ValidationError);
  });

  it("rejects invalid formatting, NaN, and scientific notation", () => {
    expect(() => decimalStringToMinor("abc")).toThrow(ValidationError);
    expect(() => decimalStringToMinor("1e5")).toThrow(ValidationError);
    expect(() => decimalStringToMinor("NaN")).toThrow(ValidationError);
    expect(() => decimalStringToMinor("")).toThrow(ValidationError);
    expect(() => decimalStringToMinor(".50")).toThrow(ValidationError);
    expect(() => decimalStringToMinor("00.50")).toThrow(ValidationError);
  });

  it("rejects values exceeding PostgreSQL 64-bit signed integer limits", () => {
    const outOfBounds = "92233720368547758.08"; // 9223372036854775808 paise > MAX_BIGINT_64
    expect(() => decimalStringToMinor(outOfBounds)).toThrow(ValidationError);
  });
});
