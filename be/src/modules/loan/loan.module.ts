import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TABLE_NAME } from '../../commons/constants';
import { LoanSchema } from '../../database/entities';
import { LoanService } from './loan.service';
import { LoanSigningService } from './loan-signing.service';
import { LoanController } from './loan.controller';
import { DashboardController } from './dashboard.controller';
import { EscrowModule } from '../escrow';
import { RadFiModule } from '../radfi/radfi.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TABLE_NAME.LOAN, schema: LoanSchema }]),
    EscrowModule,
    RadFiModule,
    UserModule,
  ],
  controllers: [LoanController, DashboardController],
  providers: [LoanService, LoanSigningService],
  exports: [LoanService, LoanSigningService],
})
export class LoanModule {}
