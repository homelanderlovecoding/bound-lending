import { registerAs } from '@nestjs/config';
import { ENV_REGISTER } from '../commons/constants';
import { IUnisatConfig } from '../commons/types';

export default registerAs(
  ENV_REGISTER.UNISAT,
  (): IUnisatConfig => ({
    baseUrl: process.env.UNISAT_BASE_URL || 'https://open-api-signet.unisat.io',
    apiKey: process.env.UNISAT_API_KEY || '',
    busdRuneId: process.env.BUSD_RUNE_ID || '',
  }),
);
