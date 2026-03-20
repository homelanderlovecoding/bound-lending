import { Module } from '@nestjs/common';
import { UnisatService } from './unisat.service';

@Module({
  providers: [UnisatService],
  exports: [UnisatService],
})
export class UnisatModule {}
