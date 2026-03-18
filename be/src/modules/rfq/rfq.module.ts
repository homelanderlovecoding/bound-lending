import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TABLE_NAME } from '../../commons/constants';
import { RfqSchema } from '../../database/entities';
import { RfqService } from './rfq.service';
import { RfqController } from './rfq.controller';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TABLE_NAME.RFQ, schema: RfqSchema }]),
    UserModule,
  ],
  controllers: [RfqController],
  providers: [RfqService],
  exports: [RfqService],
})
export class RfqModule {}
