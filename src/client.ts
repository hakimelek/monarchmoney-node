import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import speakeasy from "speakeasy";
import { getLoginEndpoint, getGraphQL, getAccountBalanceHistoryUploadEndpoint } from "./endpoints.js";
import { LoginFailedException, RequireMFAException, RequestFailedException } from "./errors.js";
import * as queries from "./queries.js";
import type {
  GetAccountsResponse,
  GetAccountTypeOptionsResponse,
  GetRecentAccountBalancesResponse,
  GetSnapshotsByAccountTypeResponse,
  GetAggregateSnapshotsResponse,
  GetAccountHoldingsResponse,
  AccountHistorySnapshot,
  GetInstitutionsResponse,
  GetBudgetsResponse,
  GetSubscriptionDetailsResponse,
  GetTransactionsSummaryResponse,
  GetTransactionsResponse,
  GetTransactionCategoriesResponse,
  GetTransactionCategoryGroupsResponse,
  GetTransactionTagsResponse,
  GetCashflowResponse,
  GetCashflowSummaryResponse,
  GetRecurringTransactionsResponse,
  CreateManualAccountResponse,
  UpdateAccountResponse,
  DeleteAccountResponse,
  ForceRefreshResponse,
  RefreshStatusAccount,
  CreateTransactionResponse,
  UpdateTransactionResponse,
  DeleteTransactionResponse,
  DeleteCategoryResponse,
  CreateCategoryResponse,
  CreateTransactionTagResponse,
  SetTransactionTagsResponse,
  UpdateTransactionSplitResponse,
  SetBudgetAmountResponse,
} from "./types.js";

const SESSION_FILE = ".mm/mm_session.json";
const DEFAULT_RECORD_LIMIT = 100;
const USER_AGENT = "monarchmoney-node (https://github.com/hakimelek/monarchmoney-node)";

export interface MonarchMoneyOptions {
  /** Path to the session file. Default: `.mm/mm_session.json` */
  sessionFile?: string;
  /** Timeout for API calls in seconds. Default: `10` */
  timeout?: number;
  /** Pre-existing auth token. Skips login if provided. */
  token?: string;
}

export class MonarchMoney {
  private _headers: Record<string, string>;
  private _sessionFile: string;
  private _token: string | null;
  private _timeout: number;

  constructor(options: MonarchMoneyOptions = {}) {
    const { sessionFile = SESSION_FILE, timeout = 10, token } = options;
    this._headers = {
      Accept: "application/json",
      "Client-Platform": "web",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    };
    if (token) {
      this._headers["Authorization"] = `Token ${token}`;
    }
    this._sessionFile = path.isAbsolute(sessionFile)
      ? sessionFile
      : path.resolve(process.cwd(), sessionFile);
    this._token = token ?? null;
    this._timeout = timeout * 1000;
  }

  /** Timeout for API calls, in seconds. */
  get timeout(): number {
    return this._timeout / 1000;
  }

  /** Sets the timeout for API calls, in seconds. */
  setTimeout(timeoutSecs: number): void {
    this._timeout = timeoutSecs * 1000;
  }

  /** The current auth token, or `null` if not logged in. */
  get token(): string | null {
    return this._token;
  }

  /** Sets the auth token directly (e.g. from an external source). */
  setToken(token: string): void {
    this._token = token;
    this._headers["Authorization"] = `Token ${token}`;
  }

  /**
   * Logs into Monarch Money.
   *
   * @param email - Account email address.
   * @param password - Account password.
   * @param options.useSavedSession - Load token from disk if available. Default: `true`.
   * @param options.saveSession - Persist token to disk after login. Default: `true`.
   * @param options.mfaSecretKey - TOTP secret for automatic MFA (base32). Bypasses MFA prompt.
   * @throws {RequireMFAException} If MFA is required. Call `multiFactorAuthenticate()` next.
   * @throws {LoginFailedException} If credentials are invalid.
   */
  async login(
    email?: string,
    password?: string,
    options: {
      useSavedSession?: boolean;
      saveSession?: boolean;
      mfaSecretKey?: string;
    } = {}
  ): Promise<void> {
    const { useSavedSession = true, saveSession = true, mfaSecretKey } = options;
    if (useSavedSession && fs.existsSync(this._sessionFile)) {
      this.loadSession(this._sessionFile);
      return;
    }
    if (!email?.trim() || !password?.trim()) {
      throw new LoginFailedException(
        "Email and password are required to login when not using a saved session."
      );
    }
    await this._loginUser(email, password, mfaSecretKey);
    if (saveSession) {
      this.saveSession(this._sessionFile);
    }
  }

  /**
   * Completes the MFA step after a `RequireMFAException`.
   *
   * @param email - Account email address.
   * @param password - Account password.
   * @param code - The 6-digit TOTP code.
   */
  async multiFactorAuthenticate(
    email: string,
    password: string,
    code: string
  ): Promise<void> {
    await this._multiFactorAuthenticate(email, password, code);
  }

  /**
   * Interactive CLI login that prompts for email, password, and MFA code if needed.
   */
  async interactiveLogin(
    options: { useSavedSession?: boolean; saveSession?: boolean } = {}
  ): Promise<void> {
    const { useSavedSession = true, saveSession = true } = options;
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const ask = (prompt: string): Promise<string> =>
      new Promise((resolve) =>
        rl.question(prompt, (answer) => resolve(answer.trim()))
      );
    let email = "";
    let passwd = "";
    try {
      email = await ask("Email: ");
      passwd = await ask("Password: ");
      await this.login(email, passwd, { useSavedSession, saveSession: false });
      if (saveSession) this.saveSession(this._sessionFile);
    } catch (e) {
      if (e instanceof RequireMFAException) {
        const code = await ask("Two Factor Code: ");
        await this.multiFactorAuthenticate(email, passwd, code);
        if (saveSession) this.saveSession(this._sessionFile);
      } else {
        throw e;
      }
    } finally {
      rl.close();
    }
  }

  /** Saves the current session token to disk. */
  saveSession(filename?: string): void {
    const file = path.resolve(filename ?? this._sessionFile);
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ token: this._token }), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  /** Loads a previously saved session token from disk. */
  loadSession(filename?: string): void {
    const file = path.resolve(filename ?? this._sessionFile);
    const raw = fs.readFileSync(file, "utf8");
    const data = JSON.parse(raw) as { token?: string };
    if (!data.token) {
      throw new LoginFailedException("Session file does not contain a valid token.");
    }
    this.setToken(data.token);
  }

  /** Deletes the session file from disk. */
  deleteSession(filename?: string): void {
    const file = path.resolve(filename ?? this._sessionFile);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  // ---------- Private auth ----------

  private async _loginUser(
    email: string,
    password: string,
    mfaSecretKey?: string
  ): Promise<void> {
    const body: Record<string, unknown> = {
      username: email,
      password,
      supports_mfa: true,
      trusted_device: false,
    };
    if (mfaSecretKey) {
      body.totp = speakeasy.totp({ secret: mfaSecretKey, encoding: "base32" });
    }
    const res = await fetch(getLoginEndpoint(), {
      method: "POST",
      headers: this._headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this._timeout),
    });
    if (res.status === 403) {
      throw new RequireMFAException();
    }
    if (!res.ok) {
      let detail = "";
      try {
        const data = (await res.json()) as Record<string, unknown>;
        detail =
          typeof data.detail === "string"
            ? data.detail
            : typeof data.error_code === "string"
              ? data.error_code
              : "";
      } catch {
        // response body not JSON
      }
      throw new LoginFailedException(
        detail || `HTTP ${res.status}: ${res.statusText}`,
        res.status
      );
    }
    const data = (await res.json()) as { token: string };
    this.setToken(data.token);
  }

  private async _multiFactorAuthenticate(
    email: string,
    password: string,
    code: string
  ): Promise<void> {
    const body = {
      username: email,
      password,
      supports_mfa: true,
      totp: code,
      trusted_device: false,
    };
    const res = await fetch(getLoginEndpoint(), {
      method: "POST",
      headers: this._headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this._timeout),
    });
    if (!res.ok) {
      let msg = "";
      try {
        const data = (await res.json()) as Record<string, unknown>;
        if (typeof data.detail === "string") msg = data.detail;
        else if (typeof data.error_code === "string") msg = data.error_code;
      } catch {
        // response body not JSON
      }
      throw new LoginFailedException(
        msg || `HTTP ${res.status}: ${res.statusText}`,
        res.status
      );
    }
    const data = (await res.json()) as { token: string };
    this.setToken(data.token);
  }

  // ---------- Private GraphQL ----------

  private async gqlCall<T>(
    operation: string,
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this._token) {
      throw new LoginFailedException(
        "Not authenticated. Call login() first or provide a token."
      );
    }
    const res = await fetch(getGraphQL(), {
      method: "POST",
      headers: this._headers,
      body: JSON.stringify({ operationName: operation, query, variables }),
      signal: AbortSignal.timeout(this._timeout),
    });
    if (!res.ok) {
      throw new RequestFailedException(
        `HTTP ${res.status}: ${res.statusText}`,
        { statusCode: res.status }
      );
    }
    const json = (await res.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      throw new RequestFailedException(
        json.errors.map((e) => e.message).join("; "),
        { graphQLErrors: json.errors }
      );
    }
    if (!json.data) {
      throw new RequestFailedException("No data in GraphQL response");
    }
    return json.data;
  }

  // ---------- Date helpers ----------

  private _getStartOfCurrentMonth(): string {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  }

  private _getEndOfCurrentMonth(): string {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);
  }

  // =====================================================================
  //  READ METHODS
  // =====================================================================

  /** Gets all accounts linked to Monarch Money. */
  async getAccounts(): Promise<GetAccountsResponse> {
    return this.gqlCall<GetAccountsResponse>("GetAccounts", queries.GET_ACCOUNTS);
  }

  /** Gets all available account types and their subtypes. */
  async getAccountTypeOptions(): Promise<GetAccountTypeOptionsResponse> {
    return this.gqlCall<GetAccountTypeOptionsResponse>(
      "GetAccountTypeOptions",
      queries.GET_ACCOUNT_TYPE_OPTIONS
    );
  }

  /**
   * Gets daily account balances starting from `startDate`.
   * Defaults to 31 days ago if not specified.
   */
  async getRecentAccountBalances(
    startDate?: string
  ): Promise<GetRecentAccountBalancesResponse> {
    if (!startDate) {
      const d = new Date();
      d.setDate(d.getDate() - 31);
      startDate = d.toISOString().slice(0, 10);
    }
    return this.gqlCall<GetRecentAccountBalancesResponse>(
      "GetAccountRecentBalances",
      queries.GET_RECENT_ACCOUNT_BALANCES,
      { startDate }
    );
  }

  /**
   * Gets net-value snapshots grouped by account type.
   * @param timeframe - `"year"` or `"month"` granularity.
   */
  async getAccountSnapshotsByType(
    startDate: string,
    timeframe: "year" | "month"
  ): Promise<GetSnapshotsByAccountTypeResponse> {
    return this.gqlCall<GetSnapshotsByAccountTypeResponse>(
      "GetSnapshotsByAccountType",
      queries.GET_SNAPSHOTS_BY_ACCOUNT_TYPE,
      { startDate, timeframe }
    );
  }

  /** Gets daily aggregate net value across all accounts. */
  async getAggregateSnapshots(options?: {
    startDate?: string;
    endDate?: string;
    accountType?: string;
  }): Promise<GetAggregateSnapshotsResponse> {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 150);
    d.setDate(1);
    return this.gqlCall<GetAggregateSnapshotsResponse>(
      "GetAggregateSnapshots",
      queries.GET_AGGREGATE_SNAPSHOTS,
      {
        filters: {
          startDate: options?.startDate ?? d.toISOString().slice(0, 10),
          endDate: options?.endDate ?? undefined,
          accountType: options?.accountType ?? undefined,
        },
      }
    );
  }

  /** Gets holdings (securities) for a brokerage or investment account. */
  async getAccountHoldings(
    accountId: string
  ): Promise<GetAccountHoldingsResponse> {
    const today = new Date().toISOString().slice(0, 10);
    return this.gqlCall<GetAccountHoldingsResponse>(
      "Web_GetHoldings",
      queries.GET_HOLDINGS,
      {
        input: {
          accountIds: [String(accountId)],
          endDate: today,
          includeHiddenHoldings: true,
          startDate: today,
        },
      }
    );
  }

  /** Gets daily balance history for a specific account. */
  async getAccountHistory(
    accountId: string
  ): Promise<AccountHistorySnapshot[]> {
    const result = await this.gqlCall<{
      account: { displayName: string };
      snapshots: { date: string; signedBalance: number }[];
    }>("AccountDetails_getAccount", queries.GET_ACCOUNT_HISTORY, {
      id: String(accountId),
    });
    return result.snapshots.map((s) => ({
      ...s,
      accountId: String(accountId),
      accountName: result.account.displayName,
    }));
  }

  /** Gets linked institutions and their credentials. */
  async getInstitutions(): Promise<GetInstitutionsResponse> {
    return this.gqlCall<GetInstitutionsResponse>(
      "Web_GetInstitutionSettings",
      queries.GET_INSTITUTIONS
    );
  }

  /**
   * Gets budgets with actual amounts for the given date range.
   * Defaults to previous month through next month.
   */
  async getBudgets(
    startDate?: string,
    endDate?: string
  ): Promise<GetBudgetsResponse> {
    let start = startDate;
    let end = endDate;
    if (!start && !end) {
      const d = new Date();
      start = new Date(d.getFullYear(), d.getMonth() - 1, 1)
        .toISOString()
        .slice(0, 10);
      end = new Date(d.getFullYear(), d.getMonth() + 2, 0)
        .toISOString()
        .slice(0, 10);
    } else if (Boolean(start) !== Boolean(end)) {
      throw new Error(
        "You must specify both startDate and endDate, not just one of them."
      );
    }
    return this.gqlCall<GetBudgetsResponse>(
      "Common_GetJointPlanningData",
      queries.GET_BUDGETS,
      { startDate: start!, endDate: end! }
    );
  }

  /** Gets Monarch Money subscription details (plan status, trial, etc.). */
  async getSubscriptionDetails(): Promise<GetSubscriptionDetailsResponse> {
    return this.gqlCall<GetSubscriptionDetailsResponse>(
      "GetSubscriptionDetails",
      queries.GET_SUBSCRIPTION_DETAILS
    );
  }

  /** Gets aggregate transaction summary (totals, averages, counts). */
  async getTransactionsSummary(): Promise<GetTransactionsSummaryResponse> {
    return this.gqlCall<GetTransactionsSummaryResponse>(
      "GetTransactionsPage",
      queries.GET_TRANSACTIONS_SUMMARY
    );
  }

  /**
   * Gets transactions with filtering, pagination, and sorting.
   * Defaults to the most recent 100 transactions.
   */
  async getTransactions(
    options: {
      limit?: number;
      offset?: number;
      startDate?: string;
      endDate?: string;
      search?: string;
      categoryIds?: string[];
      accountIds?: string[];
      tagIds?: string[];
      hasAttachments?: boolean;
      hasNotes?: boolean;
      hiddenFromReports?: boolean;
      isSplit?: boolean;
      isRecurring?: boolean;
      importedFromMint?: boolean;
      syncedFromInstitution?: boolean;
    } = {}
  ): Promise<GetTransactionsResponse> {
    const {
      limit = DEFAULT_RECORD_LIMIT,
      offset = 0,
      startDate,
      endDate,
      search = "",
      categoryIds = [],
      accountIds = [],
      tagIds = [],
      hasAttachments,
      hasNotes,
      hiddenFromReports,
      isSplit,
      isRecurring,
      importedFromMint,
      syncedFromInstitution,
    } = options;

    if (Boolean(startDate) !== Boolean(endDate)) {
      throw new Error(
        "You must specify both startDate and endDate, not just one."
      );
    }

    const filters: Record<string, unknown> = {
      search,
      categories: categoryIds,
      accounts: accountIds,
      tags: tagIds,
    };
    if (hasAttachments != null) filters.hasAttachments = hasAttachments;
    if (hasNotes != null) filters.hasNotes = hasNotes;
    if (hiddenFromReports != null) filters.hideFromReports = hiddenFromReports;
    if (isRecurring != null) filters.isRecurring = isRecurring;
    if (isSplit != null) filters.isSplit = isSplit;
    if (importedFromMint != null) filters.importedFromMint = importedFromMint;
    if (syncedFromInstitution != null)
      filters.syncedFromInstitution = syncedFromInstitution;
    if (startDate && endDate) {
      filters.startDate = startDate;
      filters.endDate = endDate;
    }

    return this.gqlCall<GetTransactionsResponse>(
      "GetTransactionsList",
      queries.GET_TRANSACTIONS_LIST,
      { offset, limit, orderBy: "date", filters }
    );
  }

  /** Gets all transaction categories. */
  async getTransactionCategories(): Promise<GetTransactionCategoriesResponse> {
    return this.gqlCall<GetTransactionCategoriesResponse>(
      "GetCategories",
      queries.GET_CATEGORIES
    );
  }

  /** Gets all category groups. */
  async getTransactionCategoryGroups(): Promise<GetTransactionCategoryGroupsResponse> {
    return this.gqlCall<GetTransactionCategoryGroupsResponse>(
      "ManageGetCategoryGroups",
      queries.GET_CATEGORY_GROUPS
    );
  }

  /** Gets detailed data for a single transaction. */
  async getTransactionDetails(
    transactionId: string
  ): Promise<Record<string, unknown>> {
    return this.gqlCall(
      "GetTransactionDetails",
      queries.GET_TRANSACTION_DETAILS,
      { id: transactionId }
    );
  }

  /** Gets the splits for a transaction. */
  async getTransactionSplits(
    transactionId: string
  ): Promise<Record<string, unknown>> {
    return this.gqlCall(
      "GetTransactionSplits",
      queries.GET_TRANSACTION_SPLITS,
      { id: transactionId }
    );
  }

  /** Gets all tags configured in the account. */
  async getTransactionTags(): Promise<GetTransactionTagsResponse> {
    return this.gqlCall<GetTransactionTagsResponse>(
      "GetTransactionTags",
      queries.GET_TRANSACTION_TAGS
    );
  }

  /**
   * Gets cashflow data grouped by category, category group, and merchant.
   * Defaults to the current month.
   */
  async getCashflow(options?: {
    startDate?: string;
    endDate?: string;
  }): Promise<GetCashflowResponse> {
    if (options && Boolean(options.startDate) !== Boolean(options.endDate)) {
      throw new Error(
        "You must specify both startDate and endDate, not just one."
      );
    }
    const start = options?.startDate ?? this._getStartOfCurrentMonth();
    const end = options?.endDate ?? this._getEndOfCurrentMonth();
    return this.gqlCall<GetCashflowResponse>(
      "Web_GetCashFlowPage",
      queries.GET_CASHFLOW,
      {
        filters: {
          search: "",
          categories: [],
          accounts: [],
          tags: [],
          startDate: start,
          endDate: end,
        },
      }
    );
  }

  /**
   * Gets cashflow summary (income, expenses, savings, savings rate).
   * Defaults to the current month.
   */
  async getCashflowSummary(options?: {
    startDate?: string;
    endDate?: string;
  }): Promise<GetCashflowSummaryResponse> {
    if (options && Boolean(options.startDate) !== Boolean(options.endDate)) {
      throw new Error(
        "You must specify both startDate and endDate, not just one."
      );
    }
    const start = options?.startDate ?? this._getStartOfCurrentMonth();
    const end = options?.endDate ?? this._getEndOfCurrentMonth();
    return this.gqlCall<GetCashflowSummaryResponse>(
      "Web_GetCashFlowPage",
      queries.GET_CASHFLOW_SUMMARY,
      {
        filters: {
          search: "",
          categories: [],
          accounts: [],
          tags: [],
          startDate: start,
          endDate: end,
        },
      }
    );
  }

  /**
   * Gets upcoming recurring transactions for a date range.
   * Defaults to the current month.
   */
  async getRecurringTransactions(
    startDate?: string,
    endDate?: string
  ): Promise<GetRecurringTransactionsResponse> {
    if (Boolean(startDate) !== Boolean(endDate)) {
      throw new Error(
        "You must specify both startDate and endDate, not just one."
      );
    }
    return this.gqlCall<GetRecurringTransactionsResponse>(
      "Web_GetUpcomingRecurringTransactionItems",
      queries.GET_RECURRING_TRANSACTIONS,
      {
        startDate: startDate ?? this._getStartOfCurrentMonth(),
        endDate: endDate ?? this._getEndOfCurrentMonth(),
      }
    );
  }

  /** Checks whether a prior account refresh request has completed. */
  async isAccountsRefreshComplete(accountIds?: string[]): Promise<boolean> {
    const result = await this.gqlCall<{ accounts: RefreshStatusAccount[] }>(
      "ForceRefreshAccountsQuery",
      queries.GET_REFRESH_STATUS
    );
    if (!result.accounts) {
      throw new RequestFailedException("Unable to check refresh status");
    }
    const list = accountIds?.length
      ? result.accounts.filter((a) => accountIds.includes(a.id))
      : result.accounts;
    return list.every((a) => !a.hasSyncInProgress);
  }

  // =====================================================================
  //  WRITE METHODS
  // =====================================================================

  /** Creates a new manual account. */
  async createManualAccount(params: {
    accountType: string;
    accountSubType: string;
    isInNetWorth: boolean;
    accountName: string;
    accountBalance?: number;
  }): Promise<CreateManualAccountResponse> {
    return this.gqlCall<CreateManualAccountResponse>(
      "Web_CreateManualAccount",
      queries.CREATE_MANUAL_ACCOUNT,
      {
        input: {
          type: params.accountType,
          subtype: params.accountSubType,
          includeInNetWorth: params.isInNetWorth,
          name: params.accountName,
          displayBalance: params.accountBalance ?? 0,
        },
      }
    );
  }

  /** Updates an account's settings and/or balance. */
  async updateAccount(
    accountId: string,
    updates: {
      accountName?: string;
      accountBalance?: number;
      accountType?: string;
      accountSubType?: string;
      includeInNetWorth?: boolean;
      hideFromSummaryList?: boolean;
      hideTransactionsFromReports?: boolean;
    }
  ): Promise<UpdateAccountResponse> {
    const input: Record<string, unknown> = { id: accountId };
    if (updates.accountName != null) input.name = updates.accountName;
    if (updates.accountBalance != null)
      input.displayBalance = updates.accountBalance;
    if (updates.accountType != null) input.type = updates.accountType;
    if (updates.accountSubType != null) input.subtype = updates.accountSubType;
    if (updates.includeInNetWorth != null)
      input.includeInNetWorth = updates.includeInNetWorth;
    if (updates.hideFromSummaryList != null)
      input.hideFromList = updates.hideFromSummaryList;
    if (updates.hideTransactionsFromReports != null)
      input.hideTransactionsFromReports = updates.hideTransactionsFromReports;
    return this.gqlCall<UpdateAccountResponse>(
      "Common_UpdateAccount",
      queries.UPDATE_ACCOUNT,
      { input }
    );
  }

  /** Deletes an account by ID. */
  async deleteAccount(accountId: string): Promise<DeleteAccountResponse> {
    return this.gqlCall<DeleteAccountResponse>(
      "Common_DeleteAccount",
      queries.DELETE_ACCOUNT,
      { id: accountId }
    );
  }

  /**
   * Requests an account balance/transaction refresh. Non-blocking.
   * Use `isAccountsRefreshComplete()` to poll for status.
   */
  async requestAccountsRefresh(accountIds: string[]): Promise<boolean> {
    const result = await this.gqlCall<ForceRefreshResponse>(
      "Common_ForceRefreshAccountsMutation",
      queries.FORCE_REFRESH_ACCOUNTS,
      { input: { accountIds } }
    );
    if (!result.forceRefreshAccounts.success) {
      throw new RequestFailedException(
        JSON.stringify(result.forceRefreshAccounts.errors)
      );
    }
    return true;
  }

  /**
   * Refreshes accounts and polls until complete or timeout.
   * @returns `true` if all accounts refreshed within the timeout, `false` otherwise.
   */
  async requestAccountsRefreshAndWait(options?: {
    accountIds?: string[];
    /** Timeout in seconds. Default: `300` */
    timeout?: number;
    /** Polling interval in seconds. Default: `10` */
    delay?: number;
  }): Promise<boolean> {
    const { timeout = 300, delay = 10 } = options ?? {};
    let accountIds = options?.accountIds;
    if (!accountIds) {
      const data = await this.getAccounts();
      accountIds = data.accounts.map((a) => a.id);
    }
    await this.requestAccountsRefresh(accountIds);
    const deadline = Date.now() + timeout * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => globalThis.setTimeout(r, delay * 1000));
      if (await this.isAccountsRefreshComplete(accountIds)) return true;
    }
    return false;
  }

  /** Creates a new transaction. */
  async createTransaction(params: {
    date: string;
    accountId: string;
    amount: number;
    merchantName: string;
    categoryId: string;
    notes?: string;
    updateBalance?: boolean;
  }): Promise<CreateTransactionResponse> {
    return this.gqlCall<CreateTransactionResponse>(
      "Common_CreateTransactionMutation",
      queries.CREATE_TRANSACTION,
      {
        input: {
          date: params.date,
          accountId: params.accountId,
          amount: Math.round(params.amount * 100) / 100,
          merchantName: params.merchantName,
          categoryId: params.categoryId,
          notes: params.notes ?? "",
          shouldUpdateBalance: params.updateBalance ?? false,
        },
      }
    );
  }

  /**
   * Updates an existing transaction. Only provided fields are changed.
   */
  async updateTransaction(
    transactionId: string,
    updates: {
      categoryId?: string;
      merchantName?: string;
      goalId?: string;
      amount?: number;
      date?: string;
      hideFromReports?: boolean;
      needsReview?: boolean;
      notes?: string;
    }
  ): Promise<UpdateTransactionResponse> {
    const input: Record<string, unknown> = { id: transactionId };
    if (updates.categoryId != null) input.category = updates.categoryId;
    if (updates.merchantName != null) input.name = updates.merchantName;
    if (updates.goalId != null) input.goalId = updates.goalId;
    if (updates.amount != null) input.amount = updates.amount;
    if (updates.date != null) input.date = updates.date;
    if (updates.hideFromReports != null)
      input.hideFromReports = updates.hideFromReports;
    if (updates.needsReview != null) input.needsReview = updates.needsReview;
    if (updates.notes != null) input.notes = updates.notes;
    return this.gqlCall<UpdateTransactionResponse>(
      "Web_TransactionDrawerUpdateTransaction",
      queries.UPDATE_TRANSACTION,
      { input }
    );
  }

  /** Deletes a transaction by ID. */
  async deleteTransaction(transactionId: string): Promise<boolean> {
    const result = await this.gqlCall<DeleteTransactionResponse>(
      "Common_DeleteTransactionMutation",
      queries.DELETE_TRANSACTION,
      { input: { id: transactionId } }
    );
    if (result.deleteTransaction.errors?.length) {
      throw new RequestFailedException(
        JSON.stringify(result.deleteTransaction.errors)
      );
    }
    return result.deleteTransaction.deleted;
  }

  /** Deletes a transaction category. Optionally moves transactions to another category. */
  async deleteTransactionCategory(
    categoryId: string,
    moveToCategoryId?: string
  ): Promise<boolean> {
    const result = await this.gqlCall<DeleteCategoryResponse>(
      "Web_DeleteCategory",
      queries.DELETE_CATEGORY,
      { id: categoryId, moveToCategoryId }
    );
    if (
      !result.deleteCategory.deleted &&
      result.deleteCategory.errors?.length
    ) {
      throw new RequestFailedException(
        JSON.stringify(result.deleteCategory.errors)
      );
    }
    return result.deleteCategory.deleted;
  }

  /** Deletes multiple transaction categories. Returns results per category. */
  async deleteTransactionCategories(
    categoryIds: string[]
  ): Promise<(boolean | Error)[]> {
    return Promise.all(
      categoryIds.map((id) =>
        this.deleteTransactionCategory(id).catch((e) =>
          e instanceof Error ? e : new Error(String(e))
        )
      )
    );
  }

  /** Creates a new transaction category within a category group. */
  async createTransactionCategory(params: {
    groupId: string;
    name: string;
    icon?: string;
    rolloverStartMonth?: string;
    rolloverEnabled?: boolean;
    rolloverType?: string;
  }): Promise<CreateCategoryResponse> {
    const d = new Date();
    d.setDate(1);
    return this.gqlCall<CreateCategoryResponse>(
      "Web_CreateCategory",
      queries.CREATE_CATEGORY,
      {
        input: {
          groupId: params.groupId,
          name: params.name,
          icon: params.icon ?? "\u2753",
          rolloverStartMonth:
            params.rolloverStartMonth ?? d.toISOString().slice(0, 10),
          rolloverEnabled: params.rolloverEnabled ?? false,
          rolloverType: params.rolloverType ?? "monthly",
        },
      }
    );
  }

  /** Creates a new tag for transactions. */
  async createTransactionTag(
    name: string,
    color: string
  ): Promise<CreateTransactionTagResponse> {
    return this.gqlCall<CreateTransactionTagResponse>(
      "Common_CreateTransactionTag",
      queries.CREATE_TRANSACTION_TAG,
      { input: { name, color } }
    );
  }

  /** Sets (replaces) all tags on a transaction. */
  async setTransactionTags(
    transactionId: string,
    tagIds: string[]
  ): Promise<SetTransactionTagsResponse> {
    return this.gqlCall<SetTransactionTagsResponse>(
      "Web_SetTransactionTags",
      queries.SET_TRANSACTION_TAGS,
      { input: { transactionId, tagIds } }
    );
  }

  /**
   * Creates, modifies, or removes splits on a transaction.
   * Pass an empty array to remove all splits.
   * The sum of split amounts must equal the transaction amount.
   */
  async updateTransactionSplits(
    transactionId: string,
    splitData: Array<{
      merchantName: string;
      amount: number;
      categoryId: string;
    }>
  ): Promise<UpdateTransactionSplitResponse> {
    return this.gqlCall<UpdateTransactionSplitResponse>(
      "Common_SplitTransactionMutation",
      queries.SPLIT_TRANSACTION,
      { input: { transactionId, splitData } }
    );
  }

  /**
   * Sets a budget amount for a category or category group.
   * A zero amount clears the budget. Exactly one of `categoryId` or `categoryGroupId` is required.
   */
  async setBudgetAmount(params: {
    amount: number;
    categoryId?: string;
    categoryGroupId?: string;
    timeframe?: string;
    startDate?: string;
    applyToFuture?: boolean;
  }): Promise<SetBudgetAmountResponse> {
    const { categoryId, categoryGroupId } = params;
    if ((categoryId == null) === (categoryGroupId == null)) {
      throw new Error(
        "You must specify either categoryId OR categoryGroupId; not both."
      );
    }
    return this.gqlCall<SetBudgetAmountResponse>(
      "Common_UpdateBudgetItem",
      queries.UPDATE_BUDGET_ITEM,
      {
        input: {
          startDate: params.startDate ?? this._getStartOfCurrentMonth(),
          timeframe: params.timeframe ?? "month",
          categoryId: categoryId ?? undefined,
          categoryGroupId: categoryGroupId ?? undefined,
          amount: params.amount,
          applyToFuture: params.applyToFuture ?? false,
        },
      }
    );
  }

  /**
   * Uploads a CSV file of balance history for a manual account.
   * @param accountId - The account to apply history to.
   * @param csvContent - CSV string content.
   */
  async uploadAccountBalanceHistory(
    accountId: string,
    csvContent: string
  ): Promise<void> {
    if (!accountId?.trim() || !csvContent?.trim()) {
      throw new RequestFailedException(
        "accountId and csvContent cannot be empty"
      );
    }
    const form = new FormData();
    form.append(
      "files",
      new Blob([csvContent], { type: "text/csv" }),
      "upload.csv"
    );
    form.append(
      "account_files_mapping",
      JSON.stringify({ "upload.csv": accountId })
    );
    const headers: Record<string, string> = { ...this._headers };
    delete headers["Content-Type"];
    const res = await fetch(getAccountBalanceHistoryUploadEndpoint(), {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(this._timeout),
    });
    if (!res.ok) {
      throw new RequestFailedException(
        `HTTP ${res.status}: ${res.statusText}`,
        { statusCode: res.status }
      );
    }
  }
}
