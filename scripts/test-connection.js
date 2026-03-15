/**
 * Test connection to Monarch Money API (api.monarch.com).
 * Run after build: npm run build && npm run test:connection
 *
 * Loads .env from project root. Use either:
 *   MONARCH_EMAIL + MONARCH_PASSWORD
 *   MONARCH_EMAIL_ME + MONARCH_PASSWORD_ME
 *   MONARCH_MFA_SECRET   (optional, base32 TOTP secret)
 *   MONARCH_TOKEN         (optional, skip login entirely with a saved token)
 *
 * Modes:
 *   Default: prompts for email OTP or MFA if the API requires it.
 *   --no-mfa: exits immediately if any verification is required.
 *   --token:  uses MONARCH_TOKEN from .env (skips login altogether).
 */
import "dotenv/config";
import * as readline from "node:readline";
import {
  MonarchMoney,
  RequireMFAException,
  EmailOtpRequiredException,
} from "../dist/index.js";

const noMfa = process.argv.includes("--no-mfa");
const useToken = process.argv.includes("--token");
const email = (process.env.MONARCH_EMAIL_ME || process.env.MONARCH_EMAIL)?.trim();
const password = (process.env.MONARCH_PASSWORD_ME || process.env.MONARCH_PASSWORD)?.trim();
const mfaSecret = noMfa ? undefined : process.env.MONARCH_MFA_SECRET?.trim();
const savedToken = process.env.MONARCH_TOKEN?.trim();

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve((answer || "").trim());
    });
  });
}

async function printAccounts(mm) {
  const data = await mm.getAccounts();
  const list = data.accounts ?? [];
  console.log("getAccounts() OK. Accounts:", list.length);
  if (list.length > 0) {
    const first = list[0];
    console.log("  First account:", first.displayName, "| Balance:", first.currentBalance ?? first.displayBalance);
  }
  console.log("\nConnection test passed.");
}

async function main() {
  const mm = new MonarchMoney({ timeout: 15 });

  // --- Token mode: skip login entirely ---
  if (useToken) {
    if (!savedToken) {
      console.error("--token flag used but MONARCH_TOKEN is not set in .env");
      process.exit(1);
    }
    console.log("Using saved token from MONARCH_TOKEN...");
    mm.setToken(savedToken);
    await printAccounts(mm);
    return;
  }

  // --- Login mode ---
  if (!email || !password) {
    console.error("Missing credentials. Set MONARCH_EMAIL + MONARCH_PASSWORD in .env (or use --token with MONARCH_TOKEN).");
    process.exit(1);
  }

  if (noMfa) console.log("Mode: --no-mfa (will exit if verification is required).");
  console.log("Connecting to Monarch Money API (api.monarch.com)...");

  try {
    await mm.login(email, password, {
      useSavedSession: false,
      saveSession: false,
      mfaSecretKey: mfaSecret || undefined,
    });
    console.log("Login OK.");
    await printAccounts(mm);
  } catch (e) {
    if (noMfa && (e instanceof EmailOtpRequiredException || e instanceof RequireMFAException)) {
      console.error("Account requires verification:", e.message);
      console.error("Run without --no-mfa to be prompted, or use --token with a saved token.");
      process.exit(1);
    }

    if (e instanceof EmailOtpRequiredException) {
      console.log("Email verification required. Check your inbox.");
      const code = await prompt("Enter the code from your email: ");
      if (!code) { console.error("No code entered."); process.exit(1); }
      await mm.submitEmailOtp(email, password, code);
      console.log("Email OTP accepted. Login OK.");
      console.log("Tip: save this token in .env as MONARCH_TOKEN to skip login next time:");
      console.log("  MONARCH_TOKEN=" + mm.token);
      await printAccounts(mm);
    } else if (e instanceof RequireMFAException) {
      console.log("MFA required.");
      if (mfaSecret) {
        console.error("TOTP secret was provided but MFA still failed:", e.message);
      } else {
        console.error("Set MONARCH_MFA_SECRET in .env, or run interactiveLogin().");
      }
      process.exit(1);
    } else {
      console.error("Error:", e.message);
      if (e.statusCode) console.error("HTTP status:", e.statusCode);
      process.exit(1);
    }
  }
}

main();
