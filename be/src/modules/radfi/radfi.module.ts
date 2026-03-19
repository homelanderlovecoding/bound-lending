import { Module } from '@nestjs/common';
import { RadFiService } from './radfi.service';
import { RadFiController } from './radfi.controller';

@Module({
  controllers: [RadFiController],
  providers: [RadFiService],
  exports: [RadFiService],
})
export class RadFiModule {}
