# Monarch Money (Node.js)

Node.js/TypeScript library for accessing [Monarch Money](https://www.monarchmoney.com) data.

Port of the [Python monarchmoney library](https://github.com/hammem/monarchmoney) with full TypeScript types, JSDoc, and a clean modular architecture.

> **Disclaimer:** This project is unofficial and not affiliated with Monarch Money.

## Installation

```bash
npm install monarchmoney
```

Requires **Node.js 18+** (uses native `fetch` and `AbortSignal.timeout`).

## Quick Start

```ts
import { MonarchMoney, RequireMFAException } from "monarchmoney";

const mm = new MonarchMoney();

// Login
try {
  await mm.login("your@email.com", "password");
} catch (e) {
  if (e instanceof RequireMFAException) {
    await mm.multiFactorAuthenticate("your@email.com", "password", "123456");
  }
}

// Fetch data — fully typed responses
const { accounts } = await mm.getAccounts();
console.log(accounts[0].displayName, accounts[0].currentBalance);
```

## Authentication

### Non-interactive

```ts
await mm.login("email", "password", {
  useSavedSession: true,   // load token from disk if available (default)
  saveSession: true,        // persist token after login (default)
});
```

### With MFA secret key (automatic TOTP)

```ts
await mm.login("email", "password", {
  mfaSecretKey: "YOUR_BASE32_SECRET",
});
```

The MFA secret is the "Two-factor text code" from **Settings > Security > Enable MFA** in Monarch Money.

### Interactive CLI

```ts
await mm.interactiveLogin(); // prompts for email, password, MFA code
```

### Direct token

```ts
const mm = new MonarchMoney({ token: "your-existing-token" });
```

### Session persistence

```ts
mm.saveSession();          // saves to .mm/mm_session.json (mode 0o600)
mm.loadSession();          // loads from disk
mm.deleteSession();        // removes the file
```

## API

All methods return **typed responses** — no `Record<string, unknown>`. Hover over any method in your editor for full JSDoc and type information.

### Read Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getAccounts()` | `GetAccountsResponse` | All linked accounts |
| `getAccountTypeOptions()` | `GetAccountTypeOptionsResponse` | Available account types/subtypes |
| `getRecentAccountBalances(startDate?)` | `GetRecentAccountBalancesResponse` | Daily balances (default: last 31 days) |
| `getAccountSnapshotsByType(startDate, timeframe)` | `GetSnapshotsByAccountTypeResponse` | Snapshots by type (`"year"` / `"month"`) |
| `getAggregateSnapshots(options?)` | `GetAggregateSnapshotsResponse` | Aggregate net value over time |
| `getAccountHoldings(accountId)` | `GetAccountHoldingsResponse` | Securities in a brokerage account |
| `getAccountHistory(accountId)` | `AccountHistorySnapshot[]` | Daily balance history |
| `getInstitutions()` | `GetInstitutionsResponse` | Linked institutions |
| `getBudgets(startDate?, endDate?)` | `GetBudgetsResponse` | Budgets with actuals (default: last month → next month) |
| `getSubscriptionDetails()` | `GetSubscriptionDetailsResponse` | Plan status (trial, premium, etc.) |
| `getTransactionsSummary()` | `GetTransactionsSummaryResponse` | Aggregate summary |
| `getTransactions(options?)` | `GetTransactionsResponse` | Transactions with full filtering |
| `getTransactionCategories()` | `GetTransactionCategoriesResponse` | All categories |
| `getTransactionCategoryGroups()` | `GetTransactionCategoryGroupsResponse` | Category groups |
| `getTransactionDetails(id)` | typed response | Single transaction detail |
| `getTransactionSplits(id)` | typed response | Splits for a transaction |
| `getTransactionTags()` | `GetTransactionTagsResponse` | All tags |
| `getCashflow(options?)` | `GetCashflowResponse` | Cashflow by category, group, merchant |
| `getCashflowSummary(options?)` | `GetCashflowSummaryResponse` | Income, expense, savings, savings rate |
| `getRecurringTransactions(start?, end?)` | `GetRecurringTransactionsResponse` | Upcoming recurring transactions |
| `isAccountsRefreshComplete(ids?)` | `boolean` | Check refresh status |

### Write Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `createManualAccount(params)` | `CreateManualAccountResponse` | Create manual account |
| `updateAccount(id, updates)` | `UpdateAccountResponse` | Update account settings/balance |
| `deleteAccount(id)` | `DeleteAccountResponse` | Delete account |
| `requestAccountsRefresh(ids)` | `boolean` | Start refresh (non-blocking) |
| `requestAccountsRefreshAndWait(opts?)` | `boolean` | Refresh and poll until done |
| `createTransaction(params)` | `CreateTransactionResponse` | Create transaction |
| `updateTransaction(id, updates)` | `UpdateTransactionResponse` | Update transaction |
| `deleteTransaction(id)` | `boolean` | Delete transaction |
| `updateTransactionSplits(id, splits)` | `UpdateTransactionSplitResponse` | Manage splits |
| `createTransactionCategory(params)` | `CreateCategoryResponse` | Create category |
| `deleteTransactionCategory(id, moveTo?)` | `boolean` | Delete category |
| `deleteTransactionCategories(ids)` | `(boolean \| Error)[]` | Bulk delete |
| `createTransactionTag(name, color)` | `CreateTransactionTagResponse` | Create tag |
| `setTransactionTags(txId, tagIds)` | `SetTransactionTagsResponse` | Set tags on transaction |
| `setBudgetAmount(params)` | `SetBudgetAmountResponse` | Set/clear budget |
| `uploadAccountBalanceHistory(id, csv)` | `void` | Upload balance history CSV |

## Error Handling

```ts
import {
  MonarchMoneyError,     // base class for all errors
  RequireMFAException,   // MFA required — call multiFactorAuthenticate()
  LoginFailedException,  // bad credentials (includes .statusCode)
  RequestFailedException // API/GraphQL failure (includes .statusCode, .graphQLErrors)
} from "monarchmoney";

try {
  await mm.getAccounts();
} catch (e) {
  if (e instanceof RequestFailedException) {
    console.error(e.statusCode);     // HTTP status, if applicable
    console.error(e.graphQLErrors);  // GraphQL errors array, if applicable
    console.error(e.code);           // "HTTP_ERROR" | "REQUEST_FAILED"
  }
}
```

## Configuration

```ts
const mm = new MonarchMoney({
  sessionFile: ".mm/mm_session.json", // session file path
  timeout: 10,                         // API timeout in seconds
  token: "pre-existing-token",         // skip login
});

mm.setTimeout(30); // change timeout later
```

## Project Structure

```
src/
  index.ts      — public exports
  client.ts     — MonarchMoney class with all API methods
  errors.ts     — error classes (MonarchMoneyError hierarchy)
  endpoints.ts  — API URL constants
  queries.ts    — all GraphQL query/mutation strings
  types.ts      — TypeScript interfaces for all API responses
```

## FAQ

**How do I use this if I login to Monarch via Google?**

Set a password on your Monarch account at [Settings > Security](https://app.monarchmoney.com/settings/security), then use that password with this library.

## Testing

```bash
npm test              # run tests once
npm run test:watch    # run tests in watch mode
npm run test:coverage # run with coverage report
```

Tests use [Vitest](https://vitest.dev) and do not require real API credentials (fetch is mocked where needed).

## Contributing

Contributions welcome. Please ensure TypeScript compiles cleanly (`npm run build`) and tests pass (`npm test`).

## License

MIT
