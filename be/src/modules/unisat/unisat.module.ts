import { Module } from '@nestjs/common';
import { UnisatService } from './unisat.service';
import { UnisatController } from './unisat.controller';

@Module({
  controllers: [UnisatController],
  providers: [UnisatService],
  exports: [UnisatService],
})
export class UnisatModule {}
