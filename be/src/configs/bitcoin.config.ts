import { registerAs } from '@nestjs/config';
import { ENV_REGISTER } from '../commons/constants';
import { IBitcoinConfig } from '../commons/types';

export default registerAs(
  ENV_REGISTER.BITCOIN,
  (): IBitcoinConfig => ({
    network: (process.env.BITCOIN_NETWORK as IBitcoinConfig['network']) || 'regtest',
    boundPubkey: process.env.BOUND_PUBKEY || '',
    boundPrivateKey: process.env.BOUND_PRIVATE_KEY || '',
  }),
);
