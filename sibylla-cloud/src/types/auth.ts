/**
 * Authentication type definitions
 */

export interface RegisterInput {
  email: string
  password: string
  name: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface JwtPayload {
  userId: string
  email: string
  iat?: number
  exp?: number
}

export interface RefreshTokenData {
  userId: string
  tokenId: string
  userAgent?: string
  ipAddress?: string
}

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'AuthError'
  }
}
