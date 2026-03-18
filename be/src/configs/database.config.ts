import { registerAs } from '@nestjs/config';
import { ENV_REGISTER } from '../commons/constants';
import { IDatabaseConfig } from '../commons/types';

export default registerAs(
  ENV_REGISTER.DATABASE,
  (): IDatabaseConfig => ({
    uri: process.env.DATABASE_URI || 'mongodb://localhost:27017/bound-lending',
  }),
);
