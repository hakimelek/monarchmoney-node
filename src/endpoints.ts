export const BASE_URL = "https://api.monarchmoney.com";

export const getLoginEndpoint = (): string => `${BASE_URL}/auth/login/`;
export const getGraphQL = (): string => `${BASE_URL}/graphql`;
export const getAccountBalanceHistoryUploadEndpoint = (): string =>
  `${BASE_URL}/account-balance-history/upload/`;
