#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MonarchMoney } from "./client.js";
import {
  LoginFailedException,
  RequestFailedException,
} from "./errors.js";

function getClient(): MonarchMoney {
  const token = process.env.MONARCH_TOKEN;
  if (!token) {
    throw new Error(
      "MONARCH_TOKEN environment variable is required. " +
      "Get one by running: npx @hakimelek/monarchmoney-login"
    );
  }
  return new MonarchMoney({
    token,
    retry: { maxRetries: 3, baseDelayMs: 500 },
    rateLimit: { requestsPerSecond: 5 },
  });
}

function ok(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(e: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

const server = new McpServer({
  name: "monarch-money",
  version: "0.3.0", // keep in sync with package.json
});

// ---------------------------------------------------------------------------
//  READ TOOLS
// ---------------------------------------------------------------------------

server.tool(
  "get_accounts",
  "Get all linked bank, credit, investment, and manual accounts with current balances.",
  {},
  async () => {
    try {
      return ok(await getClient().getAccounts());
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_account_holdings",
  "Get investment holdings (securities, stocks, ETFs) for a specific brokerage or investment account.",
  { account_id: z.string().describe("The account ID to fetch holdings for") },
  async ({ account_id }) => {
    try {
      return ok(await getClient().getAccountHoldings(account_id));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_account_history",
  "Get daily balance history for a specific account.",
  { account_id: z.string().describe("The account ID to fetch history for") },
  async ({ account_id }) => {
    try {
      return ok(await getClient().getAccountHistory(account_id));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_account_type_options",
  "Get all available account types and subtypes (useful when creating manual accounts).",
  {},
  async () => {
    try {
      return ok(await getClient().getAccountTypeOptions());
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_recent_account_balances",
  "Get daily account balances for a date range. Defaults to last 31 days.",
  {
    start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to 31 days ago."),
  },
  async ({ start_date }) => {
    try {
      return ok(await getClient().getRecentAccountBalances(start_date));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_aggregate_snapshots",
  "Get daily aggregate net worth across all accounts over time.",
  {
    start_date: z.string().optional().describe("Start date in YYYY-MM-DD format"),
    end_date: z.string().optional().describe("End date in YYYY-MM-DD format"),
    account_type: z.string().optional().describe("Filter by account type"),
  },
  async (args) => {
    try {
      return ok(await getClient().getAggregateSnapshots({
        startDate: args.start_date,
        endDate: args.end_date,
        accountType: args.account_type,
      }));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_institutions",
  "Get linked financial institutions and their connection status.",
  {},
  async () => {
    try {
      return ok(await getClient().getInstitutions());
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_budgets",
  "Get budgets with actual spending amounts. Defaults to previous month through next month.",
  {
    start_date: z.string().optional().describe("Start date in YYYY-MM-DD format"),
    end_date: z.string().optional().describe("End date in YYYY-MM-DD format"),
  },
  async ({ start_date, end_date }) => {
    try {
      return ok(await getClient().getBudgets(start_date, end_date));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_subscription_details",
  "Get Monarch Money subscription status (trial, premium, plan info).",
  {},
  async () => {
    try {
      return ok(await getClient().getSubscriptionDetails());
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_transactions",
  "Search and filter transactions with pagination. Returns up to `limit` transactions at a time.",
  {
    limit: z.number().int().positive().max(500).default(100).describe("Max transactions to return (default: 100)"),
    offset: z.number().int().min(0).default(0).describe("Pagination offset (default: 0)"),
    start_date: z.string().optional().describe("Start date in YYYY-MM-DD format (requires end_date)"),
    end_date: z.string().optional().describe("End date in YYYY-MM-DD format (requires start_date)"),
    search: z.string().optional().describe("Search text to filter by merchant name, notes, etc."),
    category_ids: z.array(z.string()).optional().describe("Filter by category IDs"),
    account_ids: z.array(z.string()).optional().describe("Filter by account IDs"),
    tag_ids: z.array(z.string()).optional().describe("Filter by tag IDs"),
  },
  async (args) => {
    try {
      return ok(await getClient().getTransactions({
        limit: args.limit,
        offset: args.offset,
        startDate: args.start_date,
        endDate: args.end_date,
        search: args.search,
        categoryIds: args.category_ids,
        accountIds: args.account_ids,
        tagIds: args.tag_ids,
      }));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_transactions_summary",
  "Get aggregate transaction summary: totals, averages, counts, income, expenses.",
  {},
  async () => {
    try {
      return ok(await getClient().getTransactionsSummary());
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_transaction_details",
  "Get full details for a single transaction.",
  { transaction_id: z.string().describe("The transaction ID") },
  async ({ transaction_id }) => {
    try {
      return ok(await getClient().getTransactionDetails(transaction_id));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_transaction_categories",
  "Get all transaction categories configured in the account.",
  {},
  async () => {
    try {
      return ok(await getClient().getTransactionCategories());
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_transaction_category_groups",
  "Get all category groups (e.g. Income, Food & Drink, Housing).",
  {},
  async () => {
    try {
      return ok(await getClient().getTransactionCategoryGroups());
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_transaction_tags",
  "Get all tags configured in the account.",
  {},
  async () => {
    try {
      return ok(await getClient().getTransactionTags());
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_cashflow",
  "Get cashflow data grouped by category, category group, and merchant. Defaults to current month.",
  {
    start_date: z.string().optional().describe("Start date in YYYY-MM-DD format"),
    end_date: z.string().optional().describe("End date in YYYY-MM-DD format"),
  },
  async ({ start_date, end_date }) => {
    try {
      return ok(await getClient().getCashflow({
        startDate: start_date,
        endDate: end_date,
      }));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_cashflow_summary",
  "Get cashflow summary: total income, expenses, savings, and savings rate. Defaults to current month.",
  {
    start_date: z.string().optional().describe("Start date in YYYY-MM-DD format"),
    end_date: z.string().optional().describe("End date in YYYY-MM-DD format"),
  },
  async ({ start_date, end_date }) => {
    try {
      return ok(await getClient().getCashflowSummary({
        startDate: start_date,
        endDate: end_date,
      }));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "get_recurring_transactions",
  "Get upcoming recurring transactions (subscriptions, bills). Defaults to current month.",
  {
    start_date: z.string().optional().describe("Start date in YYYY-MM-DD format"),
    end_date: z.string().optional().describe("End date in YYYY-MM-DD format"),
  },
  async ({ start_date, end_date }) => {
    try {
      return ok(await getClient().getRecurringTransactions(start_date, end_date));
    } catch (e) { return err(e); }
  }
);

// ---------------------------------------------------------------------------
//  WRITE TOOLS
// ---------------------------------------------------------------------------

server.tool(
  "create_transaction",
  "Create a new transaction in a specific account.",
  {
    date: z.string().describe("Transaction date in YYYY-MM-DD format"),
    account_id: z.string().describe("The account ID to create the transaction in"),
    amount: z.number().describe("Transaction amount (positive = income, negative = expense)"),
    merchant_name: z.string().describe("Merchant or payee name"),
    category_id: z.string().describe("Category ID for the transaction"),
    notes: z.string().optional().describe("Optional notes"),
    update_balance: z.boolean().optional().default(false).describe("Whether to update the account balance"),
  },
  async (args) => {
    try {
      return ok(await getClient().createTransaction({
        date: args.date,
        accountId: args.account_id,
        amount: args.amount,
        merchantName: args.merchant_name,
        categoryId: args.category_id,
        notes: args.notes,
        updateBalance: args.update_balance,
      }));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "update_transaction",
  "Update fields on an existing transaction. Only provided fields are changed.",
  {
    transaction_id: z.string().describe("The transaction ID to update"),
    category_id: z.string().optional().describe("New category ID"),
    merchant_name: z.string().optional().describe("New merchant name"),
    amount: z.number().optional().describe("New amount"),
    date: z.string().optional().describe("New date in YYYY-MM-DD format"),
    notes: z.string().optional().describe("New notes"),
    hide_from_reports: z.boolean().optional().describe("Whether to hide from reports"),
    needs_review: z.boolean().optional().describe("Whether to mark as needs review"),
  },
  async (args) => {
    try {
      return ok(await getClient().updateTransaction(args.transaction_id, {
        categoryId: args.category_id,
        merchantName: args.merchant_name,
        amount: args.amount,
        date: args.date,
        notes: args.notes,
        hideFromReports: args.hide_from_reports,
        needsReview: args.needs_review,
      }));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "delete_transaction",
  "Delete a transaction by ID.",
  { transaction_id: z.string().describe("The transaction ID to delete") },
  async ({ transaction_id }) => {
    try {
      return ok({ deleted: await getClient().deleteTransaction(transaction_id) });
    } catch (e) { return err(e); }
  }
);

server.tool(
  "create_manual_account",
  "Create a new manual account (not linked to a bank).",
  {
    account_name: z.string().describe("Display name for the account"),
    account_type: z.string().describe("Account type (e.g. 'depository', 'credit', 'investment')"),
    account_sub_type: z.string().describe("Account subtype (e.g. 'checking', 'savings', 'credit_card')"),
    is_in_net_worth: z.boolean().describe("Whether to include in net worth calculations"),
    account_balance: z.number().optional().default(0).describe("Starting balance"),
  },
  async (args) => {
    try {
      return ok(await getClient().createManualAccount({
        accountName: args.account_name,
        accountType: args.account_type,
        accountSubType: args.account_sub_type,
        isInNetWorth: args.is_in_net_worth,
        accountBalance: args.account_balance,
      }));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "update_account",
  "Update an account's settings (name, balance, visibility, etc.).",
  {
    account_id: z.string().describe("The account ID to update"),
    account_name: z.string().optional().describe("New display name"),
    account_balance: z.number().optional().describe("New balance"),
    include_in_net_worth: z.boolean().optional().describe("Whether to include in net worth"),
    hide_from_summary_list: z.boolean().optional().describe("Whether to hide from summary"),
  },
  async (args) => {
    try {
      return ok(await getClient().updateAccount(args.account_id, {
        accountName: args.account_name,
        accountBalance: args.account_balance,
        includeInNetWorth: args.include_in_net_worth,
        hideFromSummaryList: args.hide_from_summary_list,
      }));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "delete_account",
  "Delete an account by ID. This is irreversible.",
  { account_id: z.string().describe("The account ID to delete") },
  async ({ account_id }) => {
    try {
      return ok(await getClient().deleteAccount(account_id));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "refresh_accounts",
  "Trigger a refresh of account balances and transactions from linked institutions. Non-blocking.",
  {
    account_ids: z.array(z.string()).describe("Account IDs to refresh"),
  },
  async ({ account_ids }) => {
    try {
      await getClient().requestAccountsRefresh(account_ids);
      return ok({ success: true, message: "Refresh started. Use is_refresh_complete to check status." });
    } catch (e) { return err(e); }
  }
);

server.tool(
  "is_refresh_complete",
  "Check whether a previously started account refresh has completed.",
  {
    account_ids: z.array(z.string()).optional().describe("Account IDs to check. Omit to check all."),
  },
  async ({ account_ids }) => {
    try {
      const complete = await getClient().isAccountsRefreshComplete(account_ids);
      return ok({ complete });
    } catch (e) { return err(e); }
  }
);

server.tool(
  "set_budget_amount",
  "Set or clear a budget amount for a category or category group.",
  {
    amount: z.number().describe("Budget amount. Use 0 to clear."),
    category_id: z.string().optional().describe("Category ID (provide this OR category_group_id, not both)"),
    category_group_id: z.string().optional().describe("Category group ID (provide this OR category_id, not both)"),
    start_date: z.string().optional().describe("Budget period start date in YYYY-MM-DD format"),
    apply_to_future: z.boolean().optional().default(false).describe("Whether to apply to future months"),
  },
  async (args) => {
    try {
      return ok(await getClient().setBudgetAmount({
        amount: args.amount,
        categoryId: args.category_id,
        categoryGroupId: args.category_group_id,
        startDate: args.start_date,
        applyToFuture: args.apply_to_future,
      }));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "create_transaction_tag",
  "Create a new tag for categorizing transactions.",
  {
    name: z.string().describe("Tag name"),
    color: z.string().describe("Tag color (hex code, e.g. '#FF5733')"),
  },
  async ({ name, color }) => {
    try {
      return ok(await getClient().createTransactionTag(name, color));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "set_transaction_tags",
  "Set (replace) all tags on a transaction.",
  {
    transaction_id: z.string().describe("The transaction ID"),
    tag_ids: z.array(z.string()).describe("Tag IDs to set. Pass empty array to remove all tags."),
  },
  async ({ transaction_id, tag_ids }) => {
    try {
      return ok(await getClient().setTransactionTags(transaction_id, tag_ids));
    } catch (e) { return err(e); }
  }
);

server.tool(
  "create_transaction_category",
  "Create a new transaction category within a category group.",
  {
    group_id: z.string().describe("The category group ID to add the category to"),
    name: z.string().describe("Category name"),
    icon: z.string().optional().describe("Category icon emoji"),
  },
  async (args) => {
    try {
      return ok(await getClient().createTransactionCategory({
        groupId: args.group_id,
        name: args.name,
        icon: args.icon,
      }));
    } catch (e) { return err(e); }
  }
);

// ---------------------------------------------------------------------------
//  STARTUP
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("MCP server failed to start:", e);
  process.exit(1);
});
