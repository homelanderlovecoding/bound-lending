import { Module } from '@nestjs/common';
import { MultisigService } from './multisig.service';
import { PsbtService } from './psbt.service';
import { SigningService } from './signing.service';
import { MetadataService } from './metadata.service';

@Module({
  providers: [MultisigService, PsbtService, SigningService, MetadataService],
  exports: [MultisigService, PsbtService, SigningService, MetadataService],
})
export class EscrowModule {}
