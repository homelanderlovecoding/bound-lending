import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TABLE_NAME } from '../../commons/constants';
import { LoanSchema } from '../../database/entities';
import { LoanService } from './loan.service';
import { LoanController } from './loan.controller';
import { DashboardController } from './dashboard.controller';
import { EscrowModule } from '../escrow';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TABLE_NAME.LOAN, schema: LoanSchema }]),
    EscrowModule,
  ],
  controllers: [LoanController, DashboardController],
  providers: [LoanService],
  exports: [LoanService],
})
export class LoanModule {}
