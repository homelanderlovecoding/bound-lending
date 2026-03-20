import { Module } from '@nestjs/common';
import { RadFiService } from './radfi.service';

@Module({
  providers: [RadFiService],
  exports: [RadFiService],
})
export class RadFiModule {}
