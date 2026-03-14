import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MonarchMoney } from "../client.js";
import { LoginFailedException, RequestFailedException } from "../errors.js";

describe("MonarchMoney", () => {
  describe("constructor", () => {
    it("uses default session file and timeout when no options", () => {
      const mm = new MonarchMoney();
      expect(mm.timeout).toBe(10);
      expect(mm.token).toBeNull();
      expect(path.basename(mm["_sessionFile"])).toBe("mm_session.json");
    });

    it("sets token and Authorization header when token option provided", () => {
      const mm = new MonarchMoney({ token: "abc123" });
      expect(mm.token).toBe("abc123");
      expect(mm["_headers"]["Authorization"]).toBe("Token abc123");
    });

    it("respects custom timeout and session file", () => {
      const mm = new MonarchMoney({
        timeout: 30,
        sessionFile: "/absolute/custom/session.json",
      });
      expect(mm.timeout).toBe(30);
      expect(mm["_sessionFile"]).toBe("/absolute/custom/session.json");
    });

    it("resolves relative session file against cwd", () => {
      const mm = new MonarchMoney({ sessionFile: "custom.json" });
      expect(mm["_sessionFile"]).toBe(path.resolve(process.cwd(), "custom.json"));
    });
  });

  describe("setTimeout / setToken", () => {
    it("setTimeout updates internal timeout", () => {
      const mm = new MonarchMoney();
      mm.setTimeout(20);
      expect(mm.timeout).toBe(20);
      expect(mm["_timeout"]).toBe(20_000);
    });

    it("setToken updates token and Authorization header", () => {
      const mm = new MonarchMoney();
      mm.setToken("new-token");
      expect(mm.token).toBe("new-token");
      expect(mm["_headers"]["Authorization"]).toBe("Token new-token");
    });
  });

  describe("session", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "monarchmoney-test-"));
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true });
      } catch {
        // ignore
      }
    });

    it("saveSession writes token to file with restricted permissions", () => {
      const sessionFile = path.join(tmpDir, "session.json");
      const mm = new MonarchMoney({ sessionFile, token: "saved-token" });
      mm.saveSession();
      expect(fs.existsSync(sessionFile)).toBe(true);
      const data = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
      expect(data.token).toBe("saved-token");
      if (process.platform !== "win32") {
        const mode = fs.statSync(sessionFile).mode & 0o777;
        expect(mode).toBe(0o600);
      }
    });

    it("loadSession reads token and sets it on client", () => {
      const sessionFile = path.join(tmpDir, "session.json");
      fs.writeFileSync(sessionFile, JSON.stringify({ token: "loaded-token" }), "utf8");
      const mm = new MonarchMoney({ sessionFile });
      mm.loadSession();
      expect(mm.token).toBe("loaded-token");
    });

    it("loadSession throws when file has no token", () => {
      const sessionFile = path.join(tmpDir, "bad.json");
      fs.writeFileSync(sessionFile, "{}", "utf8");
      const mm = new MonarchMoney({ sessionFile });
      expect(() => mm.loadSession()).toThrow(LoginFailedException);
      expect(() => mm.loadSession()).toThrow("valid token");
    });

    it("deleteSession removes file", () => {
      const sessionFile = path.join(tmpDir, "session.json");
      fs.writeFileSync(sessionFile, "{}", "utf8");
      const mm = new MonarchMoney({ sessionFile });
      mm.deleteSession();
      expect(fs.existsSync(sessionFile)).toBe(false);
    });
  });

  describe("login", () => {
    it("throws LoginFailedException when no email/password and no saved session", async () => {
      const mm = new MonarchMoney({
        sessionFile: path.join(os.tmpdir(), "nonexistent-session-12345.json"),
        useSavedSession: true,
      });
      await expect(
        mm.login(undefined, undefined, { useSavedSession: true })
      ).rejects.toThrow(LoginFailedException);
      await expect(
        mm.login("", "pass", { useSavedSession: false })
      ).rejects.toThrow(LoginFailedException);
      await expect(
        mm.login("a@b.com", "  ", { useSavedSession: false })
      ).rejects.toThrow(LoginFailedException);
    });
  });

  describe("getAccounts (no token)", () => {
    it("throws LoginFailedException when not authenticated", async () => {
      const mm = new MonarchMoney();
      await expect(mm.getAccounts()).rejects.toThrow(LoginFailedException);
      await expect(mm.getAccounts()).rejects.toThrow("login");
    });
  });

  describe("getAccounts (mocked fetch)", () => {
    const mockAccountsResponse = {
      data: {
        accounts: [
          {
            id: "acc-1",
            displayName: "Checking",
            currentBalance: 1000,
            __typename: "Account",
          },
        ],
        householdPreferences: { id: "pref-1", accountGroupOrder: [], __typename: "HouseholdPreferences" },
      },
    };

    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockAccountsResponse),
          } as Response)
        )
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns accounts when authenticated and API returns data", async () => {
      const mm = new MonarchMoney({ token: "test-token" });
      const result = await mm.getAccounts();
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].id).toBe("acc-1");
      expect(result.accounts[0].displayName).toBe("Checking");
      expect(result.accounts[0].currentBalance).toBe(1000);
      expect(result.householdPreferences).toBeDefined();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAccounts (mocked fetch GraphQL errors)", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              errors: [{ message: "Unauthorized" }],
            }),
        } as Response)
      ));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("throws RequestFailedException when GraphQL returns errors", async () => {
      const mm = new MonarchMoney({ token: "bad-token" });
      await expect(mm.getAccounts()).rejects.toThrow(RequestFailedException);
      await expect(mm.getAccounts()).rejects.toThrow("Unauthorized");
    });
  });
});
