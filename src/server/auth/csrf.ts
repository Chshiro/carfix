import { NextRequest } from 'next/server';
import { ForbiddenError } from '../errors';

/**
 * Validates Origin and Referer headers against Host header for mutation requests
 * to protect against Cross-Site Request Forgery (CSRF) in cookie-authenticated routes.
 */
export function validateCsrfOrigin(req: NextRequest | Request): boolean {
  const method = req.method.toUpperCase();

  // Safe HTTP methods do not require CSRF origin validation
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('host');

  // If no Origin and no Referer (e.g. non-browser API client, server-side tests, curl), allow
  if (!origin && !referer) {
    return true;
  }

  // Check Origin header first
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (host) {
        // Compare origin host with Host header
        if (originUrl.host.toLowerCase() === host.toLowerCase()) {
          return true;
        }
      }
      // Allow localhost and local IP in development
      if (
        originUrl.hostname === 'localhost' ||
        originUrl.hostname === '127.0.0.1' ||
        originUrl.hostname === '0.0.0.0'
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Check Referer header if Origin is not present
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (host) {
        if (refererUrl.host.toLowerCase() === host.toLowerCase()) {
          return true;
        }
      }
      if (
        refererUrl.hostname === 'localhost' ||
        refererUrl.hostname === '127.0.0.1' ||
        refererUrl.hostname === '0.0.0.0'
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  return true;
}

export function enforceCsrf(req: NextRequest | Request): void {
  if (!validateCsrfOrigin(req)) {
    throw new ForbiddenError('Cross-Site Request Forgery (CSRF) validation failed');
  }
}
