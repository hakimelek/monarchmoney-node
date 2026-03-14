/**
 * Base error for all Monarch Money API errors.
 */
export class MonarchMoneyError extends Error {
  public readonly code: string;

  constructor(message: string, code = "MONARCH_ERROR") {
    super(message);
    this.name = "MonarchMoneyError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when multi-factor authentication is required to complete login.
 * Catch this error and call `multiFactorAuthenticate()` with the TOTP code.
 */
export class RequireMFAException extends MonarchMoneyError {
  constructor(message = "Multi-Factor Auth Required") {
    super(message, "MFA_REQUIRED");
    this.name = "RequireMFAException";
  }
}

/**
 * Thrown when login fails due to invalid credentials, account issues, or other auth errors.
 */
export class LoginFailedException extends MonarchMoneyError {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message, "LOGIN_FAILED");
    this.name = "LoginFailedException";
    this.statusCode = statusCode;
  }
}

/**
 * Thrown when a GraphQL or HTTP request to the Monarch Money API fails.
 */
export class RequestFailedException extends MonarchMoneyError {
  public readonly statusCode?: number;
  public readonly graphQLErrors?: Array<{ message: string }>;

  constructor(
    message: string,
    options?: { statusCode?: number; graphQLErrors?: Array<{ message: string }> }
  ) {
    super(message, options?.statusCode ? "HTTP_ERROR" : "REQUEST_FAILED");
    this.name = "RequestFailedException";
    this.statusCode = options?.statusCode;
    this.graphQLErrors = options?.graphQLErrors;
  }
}
