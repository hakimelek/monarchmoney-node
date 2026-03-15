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
 * Thrown when multi-factor authentication (TOTP) is required to complete login.
 * Catch this and call `multiFactorAuthenticate(email, password, totpCode)`.
 */
export class RequireMFAException extends MonarchMoneyError {
  constructor(message = "Multi-Factor Auth Required") {
    super(message, "MFA_REQUIRED");
    this.name = "RequireMFAException";
  }
}

/**
 * Thrown when the API sends a one-time code to the user's email that must be
 * submitted to continue login. Catch this and call
 * `submitEmailOtp(email, password, code)` with the code from the email.
 *
 * @example
 * ```ts
 * try {
 *   await mm.login(email, password);
 * } catch (e) {
 *   if (e instanceof EmailOtpRequiredException) {
 *     const code = await promptUser("Enter the code from your email:");
 *     await mm.submitEmailOtp(email, password, code);
 *   }
 * }
 * ```
 */
export class EmailOtpRequiredException extends MonarchMoneyError {
  constructor(message = "Email verification code required. Check your email.") {
    super(message, "EMAIL_OTP_REQUIRED");
    this.name = "EmailOtpRequiredException";
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
