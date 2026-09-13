import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

/**
 * Extracts client IP address defensively from HTTP request headers
 */
export function getClientIp(req: NextRequest | Request | Headers): string {
  let headers: Headers;

  if ('headers' in req && typeof req.headers.get === 'function') {
    headers = req.headers;
  } else if (req instanceof Headers) {
    headers = req;
  } else {
    return '127.0.0.1';
  }

  // Check common reverse proxy headers in priority order
  const cfConnectingIp = headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }

  const xRealIp = headers.get('x-real-ip');
  if (xRealIp) {
    return xRealIp.trim();
  }

  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor) {
    // Left-most IP is the original client IP
    const ips = xForwardedFor.split(',');
    const clientIp = ips[0]?.trim();
    if (clientIp) {
      return clientIp;
    }
  }

  return '127.0.0.1';
}

/**
 * Generates SHA-256 hash of client IP for privacy-preserving rate limiting
 */
export function hashIp(ip: string): string {
  const normalized = ip.trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
