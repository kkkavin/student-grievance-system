import crypto from 'node:crypto';
import { JWTPayload } from '../types.ts';

const DEFAULT_SECRET = process.env.JWT_SECRET || 'grievance-system-jwt-secret-key-prod-2026';
const DEFAULT_EXPIRES_IN = 86400; // 24 hours in seconds

/**
 * Base64URL encode string or Buffer without padding
 */
function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64URL decode string to utf8 string
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Signs a JWT payload using RFC 7519 HS256 (HMAC-SHA256)
 */
export function signToken(
  payload: JWTPayload,
  secret: string = DEFAULT_SECRET,
  expiresInSeconds: number = DEFAULT_EXPIRES_IN,
): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: payload.iat !== undefined ? payload.iat : now,
    exp: payload.exp !== undefined ? payload.exp : now + expiresInSeconds,
    iss: payload.iss || 'student-grievance-system',
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signatureInput);
  const signature = base64UrlEncode(hmac.digest());

  return `${signatureInput}.${signature}`;
}

/**
 * Verifies a JWT token using RFC 7519 HS256.
 * Returns decoded payload if valid and unexpired; returns null if invalid.
 */
export function verifyToken(
  token: string,
  secret: string = DEFAULT_SECRET,
): JWTPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return null;
  }

  try {
    // 1. Verify header algorithm
    const headerJson = JSON.parse(base64UrlDecode(headerB64));
    if (headerJson.alg !== 'HS256' || (headerJson.typ && headerJson.typ !== 'JWT')) {
      return null;
    }

    // 2. Compute expected HMAC signature
    const signatureInput = `${headerB64}.${payloadB64}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signatureInput);
    const expectedSignature = base64UrlEncode(hmac.digest());

    // 3. Timing-safe signature comparison
    const sigA = Buffer.from(signatureB64);
    const sigB = Buffer.from(expectedSignature);
    if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
      return null;
    }

    // 4. Decode payload and check expiration
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as JWTPayload;
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp !== undefined && typeof payload.exp === 'number' && payload.exp < now) {
      return null; // Token expired
    }

    return payload;
  } catch {
    return null;
  }
}

// Aliases for compatibility
export const signJwt = signToken;
export const verifyJwt = verifyToken;
