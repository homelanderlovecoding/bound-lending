import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TABLE_NAME } from '../../commons/constants';
import { RfqSchema } from '../../database/entities';
import { RfqService } from './rfq.service';
import { RfqController } from './rfq.controller';
import { UserModule } from '../user/user.module';
import { PriceFeedModule } from '../price-feed/price-feed.module';
import { LoanModule } from '../loan/loan.module';
import { EscrowModule } from '../escrow';
import { UnisatModule } from '../unisat/unisat.module';
import { UtxoLockService } from './utxo-lock.service';
import { OfferPsbtService } from './offer-psbt.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TABLE_NAME.RFQ, schema: RfqSchema }]),
    UserModule,
    PriceFeedModule,
    LoanModule,
    EscrowModule,
    UnisatModule,
  ],
  controllers: [RfqController],
  providers: [RfqService, UtxoLockService, OfferPsbtService],
  exports: [RfqService],
})
export class RfqModule {}
