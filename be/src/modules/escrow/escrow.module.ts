import { Module } from '@nestjs/common';
import { MultisigService } from './multisig.service';
import { PsbtService } from './psbt.service';
import { SigningService } from './signing.service';
import { MetadataService } from './metadata.service';
import { BoundSignerService } from './bound-signer.service';
import { RuneService } from './rune.service';

@Module({
  providers: [MultisigService, PsbtService, SigningService, MetadataService, BoundSignerService, RuneService],
  exports: [MultisigService, PsbtService, SigningService, MetadataService, BoundSignerService, RuneService],
})
export class EscrowModule {}
