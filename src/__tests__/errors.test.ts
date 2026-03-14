import { describe, it, expect } from "vitest";
import {
  MonarchMoneyError,
  RequireMFAException,
  LoginFailedException,
  RequestFailedException,
} from "../errors.js";

describe("MonarchMoneyError", () => {
  it("sets message and code", () => {
    const err = new MonarchMoneyError("Something failed", "CUSTOM_CODE");
    expect(err.message).toBe("Something failed");
    expect(err.code).toBe("CUSTOM_CODE");
    expect(err.name).toBe("MonarchMoneyError");
    expect(err).toBeInstanceOf(Error);
  });

  it("defaults code to MONARCH_ERROR", () => {
    const err = new MonarchMoneyError("Oops");
    expect(err.code).toBe("MONARCH_ERROR");
  });
});

describe("RequireMFAException", () => {
  it("extends MonarchMoneyError with MFA_REQUIRED code", () => {
    const err = new RequireMFAException();
    expect(err).toBeInstanceOf(MonarchMoneyError);
    expect(err.code).toBe("MFA_REQUIRED");
    expect(err.message).toBe("Multi-Factor Auth Required");
    expect(err.name).toBe("RequireMFAException");
  });

  it("accepts custom message", () => {
    const err = new RequireMFAException("Please enter your 2FA code");
    expect(err.message).toBe("Please enter your 2FA code");
  });
});

describe("LoginFailedException", () => {
  it("sets message and optional statusCode", () => {
    const err = new LoginFailedException("Invalid password", 401);
    expect(err).toBeInstanceOf(MonarchMoneyError);
    expect(err.code).toBe("LOGIN_FAILED");
    expect(err.message).toBe("Invalid password");
    expect(err.statusCode).toBe(401);
    expect(err.name).toBe("LoginFailedException");
  });

  it("works without statusCode", () => {
    const err = new LoginFailedException("Network error");
    expect(err.statusCode).toBeUndefined();
  });
});

describe("RequestFailedException", () => {
  it("sets message and optional options", () => {
    const err = new RequestFailedException("GraphQL failed", {
      statusCode: 500,
      graphQLErrors: [{ message: "Internal error" }],
    });
    expect(err).toBeInstanceOf(MonarchMoneyError);
    expect(err.message).toBe("GraphQL failed");
    expect(err.statusCode).toBe(500);
    expect(err.graphQLErrors).toEqual([{ message: "Internal error" }]);
    expect(err.code).toBe("HTTP_ERROR");
  });

  it("uses REQUEST_FAILED code when no statusCode", () => {
    const err = new RequestFailedException("No data");
    expect(err.code).toBe("REQUEST_FAILED");
    expect(err.statusCode).toBeUndefined();
    expect(err.graphQLErrors).toBeUndefined();
  });
});
