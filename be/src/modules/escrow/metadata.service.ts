import { Injectable, BadRequestException } from '@nestjs/common';
import { encode, decode } from 'cbor-x';
import { RESPONSE_CODE } from '../../commons/constants';

/** Magic bytes: "BNDL" (Bound Lending) */
const BOUND_MAGIC = Buffer.from([0x42, 0x4e, 0x44, 0x4c]);
const METADATA_VERSION = 0x01;

export interface IOriginationMetadata {
  type: 'origination';
  loanId: string;
  amountUsd: number;
  collateralBtc: number;
  rateApr: number;
  originationDate: string;
  repaymentDate: string;
  lenderId: string;
  borrowerId: string;
}

export interface IRepaymentMetadata {
  type: 'repayment';
  loanId: string;
  repayDate: string;
  principalRepaid: number;
  interestPaid: number;
  daysOutstanding: number;
}

export type TLoanMetadata = IOriginationMetadata | IRepaymentMetadata;

@Injectable()
export class MetadataService {
  /**
   * Encode loan metadata into an OP_RETURN-compatible buffer.
   * Format: MAGIC (4 bytes) + VERSION (1 byte) + CBOR payload
   */
  encodeMetadata(data: TLoanMetadata): Buffer {
    const payload = encode(data);
    return Buffer.concat([BOUND_MAGIC, Buffer.from([METADATA_VERSION]), payload]);
  }

  /**
   * Decode loan metadata from an OP_RETURN buffer.
   */
  decodeMetadata(buffer: Buffer): TLoanMetadata {
    this.validateMagicBytes(buffer);
    this.validateVersion(buffer);

    const payload = buffer.subarray(BOUND_MAGIC.length + 1);
    return decode(payload) as TLoanMetadata;
  }

  /** Check that buffer starts with BNDL magic bytes */
  private validateMagicBytes(buffer: Buffer): void {
    if (buffer.length < BOUND_MAGIC.length + 1) {
      throw new BadRequestException(RESPONSE_CODE.escrow.psbtConstructionFailed);
    }

    const magic = buffer.subarray(0, BOUND_MAGIC.length);
    if (!magic.equals(BOUND_MAGIC)) {
      throw new BadRequestException(RESPONSE_CODE.escrow.psbtConstructionFailed);
    }
  }

  /** Check version byte */
  private validateVersion(buffer: Buffer): void {
    const version = buffer[BOUND_MAGIC.length];
    if (version !== METADATA_VERSION) {
      throw new BadRequestException(RESPONSE_CODE.escrow.psbtConstructionFailed);
    }
  }
}
