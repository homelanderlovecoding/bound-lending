import { registerAs } from '@nestjs/config';
import { ENV_REGISTER } from '../commons/constants';
import { IPriceFeedConfig } from '../commons/types';

export default registerAs(
  ENV_REGISTER.PRICE_FEED,
  (): IPriceFeedConfig => ({
    intervalMs: parseInt(process.env.PRICE_FEED_INTERVAL_MS || '60000', 10),
    oracleDifferentialThresholdPct: parseFloat(process.env.ORACLE_DIFFERENTIAL_THRESHOLD_PCT || '0.25'),
    oracleRetryWaitMs: parseInt(process.env.ORACLE_RETRY_WAIT_MS || '300000', 10),
  }),
);
