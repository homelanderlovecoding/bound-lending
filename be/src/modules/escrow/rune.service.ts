import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Runestone, RuneId, Edict, none, some, Message } from 'runelib';
import { ENV_REGISTER } from '../../commons/constants';
import { IUnisatConfig } from '../../commons/types';

// Monkey-patch runelib BigInt sort bug (v1.0.7)
const origToBuffer = Message.prototype.toBuffer;
Message.prototype.toBuffer = function () {
  this.edicts.sort((a: any, b: any) => {
    if (a.id.block === b.id.block) return Number(a.id.idx - b.id.idx);
    return Number(a.id.block - b.id.block);
  });
  const origSort = this.edicts.sort;
  this.edicts.sort = function () { return this; };
  const result = origToBuffer.call(this);
  this.edicts.sort = origSort;
  return result;
};

export interface IRuneTransfer {
  outputIndex: number;   // which PSBT output receives this Rune amount
  amount: bigint;        // in smallest unit (divisibility applied)
}

/**
 * Builds Runestone OP_RETURN scripts for Rune transfers.
 *
 * A Runestone encodes:
 * - Edicts: explicit transfers (runeId → amount → outputIndex)
 * - Pointer: default output for unallocated Runes (change)
 */
@Injectable()
export class RuneService {
  private readonly logger = new Logger(RuneService.name);
  private readonly busdRuneId: string;
  private readonly busdDivisibility = 6; // bUSD has 6 decimal places

  constructor(private readonly configService: ConfigService) {
    const unisatConfig = this.configService.get<IUnisatConfig>(ENV_REGISTER.UNISAT)!;
    this.busdRuneId = unisatConfig.busdRuneId; // "251340:25"
  }

  /**
   * Parse "block:tx" string into RuneId.
   */
  private parseRuneId(runeIdStr: string): RuneId {
    const [block, tx] = runeIdStr.split(':').map((s) => BigInt(s));
    return new RuneId(block as any, tx as any);
  }

  /**
   * Convert a human-readable bUSD amount (e.g. 100.50) to smallest unit bigint.
   */
  toBusdSmallestUnit(amount: number): bigint {
    return BigInt(Math.round(amount * 10 ** this.busdDivisibility));
  }

  /**
   * Build a Runestone OP_RETURN script for bUSD transfers.
   *
   * @param transfers - Array of { outputIndex, amount (smallest unit) }
   * @param changeOutputIndex - Output index for unallocated Rune change
   * @returns Buffer containing the full OP_RETURN script (starts with 0x6a 0x5d)
   */
  buildBusdRunestone(transfers: IRuneTransfer[], changeOutputIndex: number): Buffer {
    const runeId = this.parseRuneId(this.busdRuneId);

    const edicts = transfers.map(
      (t) => new Edict(runeId, t.amount as any, BigInt(t.outputIndex) as any),
    );

    const runestone = new Runestone(
      edicts,
      none(),                                     // no etching
      none(),                                     // no mint
      some(BigInt(changeOutputIndex)) as any,      // pointer → change output
    );

    const encoded = runestone.encipher();
    this.logger.debug(
      `Runestone: ${transfers.length} edicts, change→output ${changeOutputIndex}, ${encoded.length} bytes`,
    );
    return encoded;
  }
}
