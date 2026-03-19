export interface IAppConfig {
  port: number;
  env: string;
  apiSecretKey: string;
  apiSecretWord: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;
}

export interface IDatabaseConfig {
  uri: string;
}

export interface IRedisConfig {
  host: string;
  port: number;
}

export interface IBitcoinConfig {
  network: 'mainnet' | 'testnet' | 'regtest';
  boundPubkey: string;
  boundPrivateKey: string;
}

export interface ILendingConfig {
  originationFeePct: number;
  gracePeriodDays: number;
  liquidationLtvPct: number;
  minLoanAmountUsd: number;
  minLoanTermDays: number;
  maxLtvPct: number;
  onChainConfirmationThreshold: number;
  manualReviewBtcThreshold: number;
}

export interface IPriceFeedConfig {
  intervalMs: number;
  oracleDifferentialThresholdPct: number;
  oracleRetryWaitMs: number;
}

export interface IRadFiConfig {
  baseUrl: string;
  busdRuneId: string;
}

export interface IUnisatConfig {
  baseUrl: string;
  apiKey: string;
  busdRuneId: string;
}
