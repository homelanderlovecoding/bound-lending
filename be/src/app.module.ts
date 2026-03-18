import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import {
  appConfig,
  databaseConfig,
  redisConfig,
  bitcoinConfig,
  lendingConfig,
  priceFeedConfig,
} from './configs';
import { ENV_REGISTER } from './commons/constants';
import { IDatabaseConfig } from './commons/types';
import { EscrowModule } from './modules/escrow';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, bitcoinConfig, lendingConfig, priceFeedConfig],
    }),

    // Database
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get<IDatabaseConfig>(ENV_REGISTER.DATABASE);
        return { uri: dbConfig?.uri };
      },
    }),

    // Event Emitter
    EventEmitterModule.forRoot(),

    // Feature Modules
    EscrowModule,
  ],
})
export class AppModule {}
