export interface IAuthChallenge {
  message: string;
  nonce: string;
  expiresAt: Date;
}

export interface IAuthVerifyParams {
  address: string;
  signature: string;
  nonce: string;
}

export interface IAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface IJwtPayload {
  sub: string; // user address
  userId: string;
  roles: string[];
}
