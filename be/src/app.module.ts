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
  radfiConfig,
  unisatConfig,
} from './configs';
import { ENV_REGISTER } from './commons/constants';
import { IDatabaseConfig } from './commons/types';
import { EscrowModule } from './modules/escrow';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { RfqModule } from './modules/rfq/rfq.module';
import { LoanModule } from './modules/loan/loan.module';
import { PriceFeedModule } from './modules/price-feed/price-feed.module';
import { LiquidationModule } from './modules/liquidation/liquidation.module';
import { IndexerModule } from './modules/indexer/indexer.module';
import { NotificationModule } from './modules/notification/notification.module';
import { QueueModule } from './queue/queue.module';
import { RadFiModule } from './modules/radfi/radfi.module';
import { UnisatModule } from './modules/unisat/unisat.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, bitcoinConfig, lendingConfig, priceFeedConfig, radfiConfig, unisatConfig],
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
    AuthModule,
    UserModule,
    RfqModule,
    LoanModule,
    PriceFeedModule,
    LiquidationModule,
    IndexerModule,
    NotificationModule,

    // Wallet & Indexer Integrations
    RadFiModule,
    UnisatModule,

    // Background Jobs
    QueueModule,
  ],
})
export class AppModule {}
