import { registerAs } from '@nestjs/config';
import { ENV_REGISTER } from '../commons/constants';
import { IRedisConfig } from '../commons/types';

export default registerAs(
  ENV_REGISTER.REDIS,
  (): IRedisConfig => ({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  }),
);
