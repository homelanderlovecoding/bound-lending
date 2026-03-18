import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TABLE_NAME } from '../../commons/constants';
import { UserSchema } from '../../database/entities';
import { UserService } from './user.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TABLE_NAME.USER, schema: UserSchema }]),
  ],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
