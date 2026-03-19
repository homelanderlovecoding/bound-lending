import { Module } from '@nestjs/common';
import { MultisigService } from './multisig.service';
import { PsbtService } from './psbt.service';
import { SigningService } from './signing.service';
import { MetadataService } from './metadata.service';
import { BoundSignerService } from './bound-signer.service';

@Module({
  providers: [MultisigService, PsbtService, SigningService, MetadataService, BoundSignerService],
  exports: [MultisigService, PsbtService, SigningService, MetadataService, BoundSignerService],
})
export class EscrowModule {}
