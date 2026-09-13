'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface AuthModalUser {
  id: string;
  phone: string;
  roles: string[];
  isBlocked: boolean;
  providerId?: string;
}

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AuthModalUser) => void;
}

type AuthState =
  | 'ENTER_PHONE'
  | 'SENDING'
  | 'CODE_SENT'
  | 'VERIFYING'
  | 'AUTHENTICATED'
  | 'ERROR'
  | 'LOCKED';

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [state, setState] = useState<AuthState>('ENTER_PHONE');
  const [rawPhone, setRawPhone] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number>(60);
  const [countdown, setCountdown] = useState<number>(60);
  const [demoCode, setDemoCode] = useState<string | null>(null);

  const digitInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Format phone as user types: +7 (701) 555-12-34
  const formatPhoneInput = (val: string): string => {
    const digits = val.replace(/\D/g, '');
    if (!digits) return '';

    let clean = digits;
    if (clean.startsWith('7') || clean.startsWith('8')) {
      clean = clean.slice(1);
    }
    clean = clean.slice(0, 10); // 10 digits after +7

    let res = '+7';
    if (clean.length > 0) res += ` (${clean.slice(0, 3)}`;
    if (clean.length >= 3) res += `) ${clean.slice(3, 6)}`;
    if (clean.length >= 6) res += `-${clean.slice(6, 8)}`;
    if (clean.length >= 8) res += `-${clean.slice(8, 10)}`;
    return res;
  };

  const getMaskedPhone = (): string => {
    const digits = rawPhone.replace(/\D/g, '');
    if (digits.length >= 10) {
      const clean = digits.startsWith('7') || digits.startsWith('8') ? digits.slice(1) : digits;
      return `+7 (${clean.slice(0, 3)}) ***-**-${clean.slice(-2)}`;
    }
    return rawPhone;
  };

  const getCanonicalPhone = useCallback((): string => {
    const digits = rawPhone.replace(/\D/g, '');
    if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
      return `+7${digits.slice(1)}`;
    }
    if (digits.length === 10) {
      return `+7${digits}`;
    }
    return `+${digits}`;
  }, [rawPhone]);


  // Timer countdown
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if ((state === 'CODE_SENT' || state === 'LOCKED') && countdown > 0) {
      interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (state === 'LOCKED') setState('ENTER_PHONE');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state, countdown]);

  // Reset modal when opened
  useEffect(() => {
    if (isOpen) {
      setState('ENTER_PHONE');
      setRawPhone('');
      setOtpDigits(['', '', '', '', '', '']);
      setErrorMessage(null);
      setDemoCode(null);
    }
  }, [isOpen]);

  // Auto-submit OTP when 6 digits are entered
  const handleVerifyOtp = useCallback(
    async (code: string) => {
      if (code.length !== 6) return;
      setState('VERIFYING');
      setErrorMessage(null);

      try {
        const canonicalPhone = getCanonicalPhone();
        const res = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: canonicalPhone, code }),
        });

        const json = await res.json();

        if (res.ok && json.status === 'ok') {
          setState('AUTHENTICATED');
          setTimeout(() => {
            onSuccess(json.data.user);
            onClose();
          }, 800);
        } else {
          setErrorMessage(json.error?.message || 'Неверный код подтверждения');
          setState('ERROR');
          setOtpDigits(['', '', '', '', '', '']);
          digitInputRefs.current[0]?.focus();
        }
      } catch {
        setErrorMessage('Ошибка сети. Проверьте соединение.');
        setState('ERROR');
      }
    },
    [getCanonicalPhone, onSuccess, onClose]
  );


  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const canonicalPhone = getCanonicalPhone();

    if (!/^\+77\d{9}$/.test(canonicalPhone)) {
      setErrorMessage('Введите корректный номер Казахстана: +7 (7XX) XXX-XX-XX');
      return;
    }

    setState('SENDING');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: canonicalPhone }),
      });

      const json = await res.json();

      if (res.ok && json.status === 'ok') {
        const cooldown = json.data?.retryAfter || 60;
        setRetryAfter(cooldown);
        setCountdown(cooldown);
        if (json.data?.demoCode) {
          setDemoCode(json.data.demoCode);
        }
        setState('CODE_SENT');
        setTimeout(() => {
          digitInputRefs.current[0]?.focus();
        }, 100);
      } else if (res.status === 429) {
        const retrySec = json.error?.details?.retryAfter || 60;
        setCountdown(retrySec);
        setErrorMessage(json.error?.message || `Слишком много попыток. Повторите через ${retrySec} сек.`);
        setState('LOCKED');
      } else {
        setErrorMessage(json.error?.message || 'Не удалось отправить код');
        setState('ERROR');
      }
    } catch {
      setErrorMessage('Ошибка подключения к серверу');
      setState('ERROR');
    }
  };

  const handleDigitChange = (index: number, val: string) => {
    const char = val.slice(-1);
    if (char && !/^\d$/.test(char)) return;

    const newDigits = [...otpDigits];
    newDigits[index] = char;
    setOtpDigits(newDigits);

    if (char && index < 5) {
      digitInputRefs.current[index + 1]?.focus();
    }

    const fullCode = newDigits.join('');
    if (fullCode.length === 6 && !newDigits.includes('')) {
      handleVerifyOtp(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      digitInputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const digitsArr = pasted.split('');
      setOtpDigits(digitsArr);
      digitInputRefs.current[5]?.focus();
      handleVerifyOtp(pasted);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 10, 24, 0.82)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card card-glow"
        style={{
          maxWidth: '440px',
          width: '100%',
          padding: '2rem',
          position: 'relative',
          borderRadius: '20px',
          background: 'linear-gradient(180deg, #111827 0%, #0B1120 100%)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: 'rgba(255, 255, 255, 0.05)',
            border: 'none',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
          }}
        >
          ✕
        </button>

        {/* Header Icon */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.6rem',
              color: '#FFFFFF',
              boxShadow: '0 0 25px var(--aquamarine-glow)',
              marginBottom: '1rem',
            }}
          >
            {state === 'AUTHENTICATED' ? '✓' : '🔐'}
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#FFFFFF', marginBottom: '0.35rem' }}>
            {state === 'CODE_SENT' || state === 'VERIFYING' || state === 'ERROR'
              ? 'Введите код из SMS'
              : state === 'AUTHENTICATED'
              ? 'Успешный вход!'
              : 'Вход в CarFix'}
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {state === 'CODE_SENT' || state === 'VERIFYING' || state === 'ERROR'
              ? `Отправили 6-значный код на ${getMaskedPhone()}`
              : state === 'AUTHENTICATED'
              ? 'Добро пожаловать на платформу'
              : 'Введите номер телефона для входа или регистрации'}
          </p>
        </div>

        {/* STEP 1: PHONE INPUT */}
        {(state === 'ENTER_PHONE' || state === 'SENDING' || state === 'LOCKED') && (
          <form onSubmit={handleSendOtp}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                Номер телефона (Казахстан)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="+7 (701) 555-12-34"
                  value={rawPhone}
                  onChange={(e) => setRawPhone(formatPhoneInput(e.target.value))}
                  disabled={state === 'SENDING' || state === 'LOCKED'}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.85rem 1rem 0.85rem 3rem',
                    borderRadius: '12px',
                    border: errorMessage ? '1px solid #EF4444' : '1px solid var(--border-subtle)',
                    background: 'rgba(15, 23, 42, 0.8)',
                    color: '#FFFFFF',
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    outline: 'none',
                    letterSpacing: '0.02em',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    left: '1rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '1.2rem',
                  }}
                >
                  🇰🇿
                </span>
              </div>
            </div>

            {errorMessage && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#F87171',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}
              >
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={state === 'SENDING' || state === 'LOCKED' || rawPhone.length < 16}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.9rem',
                fontSize: '1rem',
                fontWeight: 700,
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              {state === 'SENDING' ? (
                <>
                  <span className="spinner" style={{ width: '18px', height: '18px' }}></span>
                  Отправка SMS...
                </>
              ) : state === 'LOCKED' ? (
                `Повторить через ${countdown} с`
              ) : (
                'Получить код по SMS'
              )}
            </button>
          </form>
        )}

        {/* STEP 2: 6-DIGIT OTP INPUT */}
        {(state === 'CODE_SENT' || state === 'VERIFYING' || state === 'ERROR' || state === 'AUTHENTICATED') && (
          <div>
            {demoCode && (
              <div
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '10px',
                  background: 'rgba(6, 182, 212, 0.12)',
                  border: '1px solid rgba(6, 182, 212, 0.4)',
                  color: '#38BDF8',
                  fontSize: '0.85rem',
                  marginBottom: '1.25rem',
                  textAlign: 'center',
                  fontWeight: 600,
                }}
              >
                ⚡ Демо-код для входа: <strong style={{ letterSpacing: '0.1em' }}>{demoCode}</strong>
              </div>
            )}

            {/* 6 Digits Inputs */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.5rem',
                marginBottom: '1.25rem',
              }}
              onPaste={handlePaste}
            >
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    digitInputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  disabled={state === 'VERIFYING' || state === 'AUTHENTICATED'}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  style={{
                    width: '48px',
                    height: '56px',
                    borderRadius: '12px',
                    border: errorMessage
                      ? '1px solid #EF4444'
                      : digit
                      ? '2px solid #06B6D4'
                      : '1px solid var(--border-subtle)',
                    background: 'rgba(15, 23, 42, 0.85)',
                    color: '#FFFFFF',
                    fontSize: '1.5rem',
                    fontWeight: 800,
                    textAlign: 'center',
                    outline: 'none',
                    boxShadow: digit ? '0 0 15px rgba(6, 182, 212, 0.25)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                />
              ))}
            </div>

            {errorMessage && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#F87171',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                  textAlign: 'center',
                }}
              >
                {errorMessage}
              </div>
            )}

            {/* Actions: Resend or change number */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '1.25rem',
                fontSize: '0.85rem',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setState('ENTER_PHONE');
                  setErrorMessage(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Изменить номер
              </button>

              {countdown > 0 ? (
                <span style={{ color: 'var(--text-secondary)' }}>
                  Повтор через <strong style={{ color: '#FFFFFF' }}>{countdown} с</strong>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSendOtp()}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#06B6D4',
                    cursor: 'pointer',
                    fontWeight: 700,
                    padding: 0,
                  }}
                >
                  Отправить повторно
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
