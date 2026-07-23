export class AuthoringDomainError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(code: string, message: string, retryable = false, details?: unknown, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuthoringDomainError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}
