export interface ErrorDetail {
  field?: string;
  message: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: ErrorDetail[];

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details: ErrorDetail[] = []
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: ErrorDetail[] = []) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class AccountNotFoundError extends AppError {
  constructor(message: string = "Account was not found.") {
    super(404, "ACCOUNT_NOT_FOUND", message, []);
  }
}

export class InsufficientFundsError extends AppError {
  constructor(message: string = "Insufficient funds for debit operation.") {
    super(422, "INSUFFICIENT_FUNDS", message, []);
  }
}
