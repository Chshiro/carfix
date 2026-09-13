'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_TOKEN_KEY = 'carfix_customer_token';
const STORAGE_USER_KEY = 'carfix_customer_user';

export interface CustomerUser {
  id: string;
  phone: string;
  roles: string[];
}

export interface ActiveCustomerState {
  type: 'IDLE' | 'REQUEST' | 'ORDER';
  request?: {
    id: string;
    category: string;
    description: string | null;
    location: { lat: number; lng: number };
    status: string;
    currentRadiusKm?: number;
    createdAt: string;
    expiresAt?: string;
  };
  offers?: Array<{
    id: string;
    providerId: string;
    businessName: string;
    providerType: string;
    verificationLevel: string;
    rating: number;
    completedJobs: number;
    pricingMode: 'fixed' | 'diagnostic_fee' | 'estimate_range';
    amountTiyn: number | null;
    minAmountTiyn: number | null;
    maxAmountTiyn: number | null;
    etaMinutes: number;
    message: string | null;
    status: string;
    createdAt: string;
  }>;
  order?: {
    id: string;
    status: string;
    agreedPricingMode: string;
    agreedAmountTiyn: number | null;
    agreedMinTiyn: number | null;
    agreedMaxTiyn: number | null;
    finalAmountTiyn?: number | null;
    cancellationReason?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  provider?: {
    id: string;
    businessName: string;
    providerType: string;
    rating: number;
    completedJobs: number;
    phone: string;
  };
  offer?: {
    id: string;
    pricingMode: 'fixed' | 'diagnostic_fee' | 'estimate_range';
    amountTiyn: number | null;
    minAmountTiyn: number | null;
    maxAmountTiyn: number | null;
    etaMinutes: number;
    message: string | null;
  };
  reviewSubmitted?: boolean;
}

export function useCustomerSession() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [activeState, setActiveState] = useState<ActiveCustomerState | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(true);
  const [isHydratingState, setIsHydratingState] = useState<boolean>(false);

  // Fetch and hydrate active request/order
  const refreshActiveState = useCallback(async (authToken?: string) => {
    const currentToken = authToken || token;
    setIsHydratingState(true);
    try {
      const headers: Record<string, string> = {};
      if (currentToken && currentToken !== 'undefined') {
        headers['Authorization'] = `Bearer ${currentToken}`;
      }

      const res = await fetch('/api/customer/active', {
        headers,
      });
      const json = await res.json();
      if (res.ok && json.status === 'ok') {
        setActiveState(json.data);
        return json.data as ActiveCustomerState;
      } else {
        setActiveState({ type: 'IDLE' });
        return null;
      }
    } catch {
      setActiveState({ type: 'IDLE' });
      return null;
    } finally {
      setIsHydratingState(false);
    }
  }, [token]);

  // Bootstrap session: check /api/auth/me first (cookie session), fallback to localStorage/demo
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        // 1. Try resolving cookie-based session via /api/auth/me
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const meJson = await meRes.json();
          if (meJson.status === 'ok' && meJson.data?.user) {
            if (isMounted) {
              setUser(meJson.data.user);
              await refreshActiveState();
              setIsLoadingSession(false);
              return;
            }
          }
        }

        // 2. Fallback: check localStorage for saved token
        const savedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
        const savedUser = localStorage.getItem(STORAGE_USER_KEY);

        if (savedToken && savedToken !== 'undefined' && savedUser) {
          if (isMounted) {
            setToken(savedToken);
            setUser(JSON.parse(savedUser));
            await refreshActiveState(savedToken);
            setIsLoadingSession(false);
            return;
          }
        }

        // 3. Demo fallback if no session in non-production
        const demoRes = await fetch('/api/auth/demo-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'c0000000-0000-0000-0000-000000000001' }),
        });
        const demoJson = await demoRes.json();
        if (demoRes.ok && demoJson.status === 'ok' && demoJson.data?.token) {
          const defaultUser: CustomerUser = {
            id: 'c0000000-0000-0000-0000-000000000001',
            phone: '+77011112233',
            roles: ['motorist'],
          };
          if (isMounted) {
            setToken(demoJson.data.token);
            setUser(defaultUser);
            localStorage.setItem(STORAGE_TOKEN_KEY, demoJson.data.token);
            localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(defaultUser));
            await refreshActiveState(demoJson.data.token);
          }
        } else {
          if (isMounted) {
            setActiveState({ type: 'IDLE' });
          }
        }
      } catch {
        if (isMounted) {
          setActiveState({ type: 'IDLE' });
        }
      } finally {
        if (isMounted) {
          setIsLoadingSession(false);
        }
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, [refreshActiveState]);

  // Request OTP code
  const requestOtp = async (phone: string) => {
    const res = await fetch('/api/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });

    const data = await res.json();
    if (!res.ok || data.status !== 'ok') {
      throw new Error(data.error?.message || 'Не удалось отправить код подтверждения');
    }

    return data.data as { message: string; expiresInSeconds: number; demoCode?: string };
  };

  // Verify OTP code and authenticate
  const verifyOtp = async (phone: string, code: string) => {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });

    const data = await res.json();
    if (!res.ok || data.status !== 'ok') {
      throw new Error(data.error?.message || 'Неверный код подтверждения');
    }

    const newUser = data.data.user;
    setUser(newUser);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser));

    await refreshActiveState();
    return newUser;
  };

  // Login with phone number (legacy/compatibility)
  const loginWithPhone = async (phone: string, code?: string) => {
    const res = await fetch('/api/auth/phone-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });

    const data = await res.json();
    if (!res.ok || data.status !== 'ok') {
      throw new Error(data.error?.message || 'Не удалось войти по номеру телефона');
    }

    const { token: newToken, user: newUser } = data.data;
    if (newToken) {
      setToken(newToken);
      localStorage.setItem(STORAGE_TOKEN_KEY, newToken);
    }
    setUser(newUser);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser));

    await refreshActiveState(newToken);
    return newUser;
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    setToken(null);
    setUser(null);
    setActiveState({ type: 'IDLE' });
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
  };

  return {
    token,
    user,
    activeState,
    setActiveState,
    isLoadingSession,
    isHydratingState,
    requestOtp,
    verifyOtp,
    loginWithPhone,
    logout,
    refreshActiveState,
  };
}
