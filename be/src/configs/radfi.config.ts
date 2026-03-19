import { registerAs } from '@nestjs/config';
import { ENV_REGISTER } from '../commons/constants';
import { IRadFiConfig } from '../commons/types';

export default registerAs(
  ENV_REGISTER.RADFI,
  (): IRadFiConfig => ({
    baseUrl: process.env.RADFI_BASE_URL || 'https://signet.ums.radfi.co',
    busdRuneId: process.env.BUSD_RUNE_ID || '',
  }),
);
