import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bitcoin from 'bitcoinjs-lib';
import * as bitcoinMessage from 'bitcoinjs-message';
import * as ecc from 'tiny-secp256k1';
import { ENV_REGISTER, RESPONSE_CODE } from '../../commons/constants';
import { IAppConfig } from '../../commons/types';
import { IAuthChallenge, IAuthTokens, IAuthVerifyParams, IJwtPayload } from './auth.type';

bitcoin.initEccLib(ecc);

/** In-memory challenge store (swap for Redis in production) */
const challenges = new Map<string, { message: string; expiresAt: Date }>();

@Injectable()
export class AuthService {
  private readonly appConfig: IAppConfig;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.appConfig = this.configService.get<IAppConfig>(ENV_REGISTER.APP)!;
  }

  /**
   * Generate a signing challenge for a given address.
   */
  generateChallenge(address: string): IAuthChallenge {
    const nonce = randomBytes(16).toString('hex');
    const message = `Bound Lending Authentication\nAddress: ${address}\nNonce: ${nonce}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    challenges.set(nonce, { message, expiresAt });

    return { message, nonce, expiresAt };
  }

  /**
   * Verify a signed challenge and return JWT tokens.
   * Note: Actual BIP-322 signature verification is a TODO —
   * for MVP we trust the Trading Wallet integration.
   */
  async verifyAndIssueTokens(
    params: IAuthVerifyParams,
    userId: string,
    roles: string[],
  ): Promise<IAuthTokens> {
    const challenge = challenges.get(params.nonce);
    this.validateChallengeExists(challenge);
    this.validateChallengeNotExpired(challenge!);

    // Verify signature against address
    this.verifySignature(params.address, challenge!.message, params.signature);

    challenges.delete(params.nonce);

    return this.issueTokens(params.address, userId, roles);
  }

  /**
   * Refresh an access token.
   */
  async refreshAccessToken(refreshToken: string): Promise<IAuthTokens> {
    try {
      const payload = this.jwtService.verify<IJwtPayload>(refreshToken);
      return this.issueTokens(payload.sub, payload.userId, payload.roles);
    } catch {
      throw new UnauthorizedException(RESPONSE_CODE.auth.tokenExpired);
    }
  }

  /**
   * Verify and decode a JWT token.
   */
  verifyToken(token: string): IJwtPayload {
    try {
      return this.jwtService.verify<IJwtPayload>(token);
    } catch {
      throw new UnauthorizedException(RESPONSE_CODE.auth.invalidToken);
    }
  }

  /**
   * Verify a Bitcoin message signature against an address.
   * Supports: P2PKH (1...), P2WPKH (bc1q/tb1q), P2TR (bc1p/tb1p)
   * UniSat and Xverse both sign with legacy message format (base64).
   */
  private verifySignature(address: string, message: string, signature: string): void {
    try {
      const network = address.startsWith('tb1') || address.startsWith('m') || address.startsWith('n') || address.startsWith('2')
        ? bitcoin.networks.testnet  // signet uses testnet prefix
        : bitcoin.networks.bitcoin;

      // Try standard verification (works for P2PKH, P2WPKH, P2SH-P2WPKH)
      const valid = bitcoinMessage.verify(message, address, signature, undefined, true);
      if (!valid) {
        throw new BadRequestException(RESPONSE_CODE.auth.invalidSignature ?? 'Invalid signature');
      }
    } catch (err: any) {
      // If bitcoinjs-message throws (e.g. P2TR schnorr), log and reject
      this.logger.warn(`Signature verification failed for ${address}: ${err.message}`);
      throw new BadRequestException(err.message?.includes('Invalid') ? 'Invalid signature' : 'Signature verification failed');
    }
  }

  private validateChallengeExists(
    challenge: { message: string; expiresAt: Date } | undefined,
  ): void {
    if (!challenge) {
      throw new BadRequestException(RESPONSE_CODE.auth.challengeExpired);
    }
  }

  private validateChallengeNotExpired(challenge: { message: string; expiresAt: Date }): void {
    if (new Date() > challenge.expiresAt) {
      throw new BadRequestException(RESPONSE_CODE.auth.challengeExpired);
    }
  }

  private issueTokens(address: string, userId: string, roles: string[]): IAuthTokens {
    const payload: IJwtPayload = { sub: address, userId, roles };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.appConfig.jwtExpiresIn,
    });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.appConfig.jwtRefreshExpiresIn,
    });

    return { accessToken, refreshToken };
  }
}
