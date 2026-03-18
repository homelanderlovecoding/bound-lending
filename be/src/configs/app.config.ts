import { registerAs } from '@nestjs/config';
import { ENV_REGISTER } from '../commons/constants';
import { IAppConfig } from '../commons/types';

export default registerAs(
  ENV_REGISTER.APP,
  (): IAppConfig => ({
    port: parseInt(process.env.APP_PORT || '3000', 10),
    env: process.env.APP_ENV || 'development',
    apiSecretKey: process.env.API_SECRET_KEY || '',
    apiSecretWord: process.env.API_SECRET_WORD || '',
    jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  }),
);
