import { ValidationError } from '../errors';

/**
 * Kazakhstan Mobile Operator DEF Prefix Codes:
 * - Beeline / Izi: 705, 771, 776, 777
 * - Kcell / Activ: 701, 702, 775, 778
 * - Tele2 / Altel: 700, 707, 708, 747
 * - Special/Virtual/M2M: 706, 709, 750, 751, 760, 761, 762, 763, 764
 */
export const KZ_MOBILE_PREFIXES = new Set([
  '700', '701', '702', '705', '706', '707', '708', '709',
  '747', '750', '751', '760', '761', '762', '763', '764',
  '771', '775', '776', '777', '778',
]);

/**
 * Normalizes input raw phone string into canonical E.164 Kazakhstan format: +77XXXXXXXXX
 * Rejects invalid characters, wrong lengths, or invalid country codes.
 */
export function normalizeKzPhone(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    throw new ValidationError('Номер телефона обязателен для заполнения');
  }

  // Strip all non-digit characters
  const digits = raw.replace(/\D/g, '');

  let normalized: string;

  if (digits.length === 11) {
    if (digits.startsWith('7') || digits.startsWith('8')) {
      normalized = `+7${digits.slice(1)}`;
    } else {
      throw new ValidationError('Номер телефона должен начинаться с +7 или 8 (Казахстан)');
    }
  } else if (digits.length === 10) {
    // e.g. 7015551234 -> +77015551234
    normalized = `+7${digits}`;
  } else {
    throw new ValidationError('Некорректная длина номера телефона (требуется 11 цифр)');
  }

  if (!validateKzPhone(normalized)) {
    throw new ValidationError(
      'Номер телефона должен принадлежать действующему мобильному оператору Казахстана (+7 7xx xxx xx xx)'
    );
  }

  return normalized;
}

/**
 * Validates canonical Kazakhstan phone number (+77XXXXXXXXX)
 */
export function validateKzPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  // Exact 12 characters: +77 followed by 9 digits
  if (!/^\+77\d{9}$/.test(phone)) {
    return false;
  }

  const defCode = phone.slice(2, 5); // Digits after +7: e.g. 701, 777
  return KZ_MOBILE_PREFIXES.has(defCode);
}

/**
 * Formats canonical phone for safe display: +7 (701) ***-**-34
 */
export function maskPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    return '***';
  }

  const clean = phone.replace(/\D/g, '');
  if (clean.length === 11) {
    const def = clean.slice(1, 4);
    const last2 = clean.slice(9);
    return `+7 (${def}) ***-**-${last2}`;
  }

  return phone.length > 4 ? `+7 ***-**-${phone.slice(-2)}` : '***';
}

/**
 * Formats canonical phone into human-readable representation: +7 (701) 555-12-34
 */
export function formatKzPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 11) {
    return `+7 (${clean.slice(1, 4)}) ${clean.slice(4, 7)}-${clean.slice(7, 9)}-${clean.slice(9, 11)}`;
  }
  return phone;
}
