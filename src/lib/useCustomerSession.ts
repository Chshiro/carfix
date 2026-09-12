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
    if (!currentToken) {
      setActiveState({ type: 'IDLE' });
      return null;
    }

    setIsHydratingState(true);
    try {
      const res = await fetch('/api/customer/active', {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
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

  // Load session from localStorage on mount
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
      const savedUser = localStorage.getItem(STORAGE_USER_KEY);

      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        refreshActiveState(savedToken);
      } else {
        // Fallback demo auto-login for seamless testing
        fetch('/api/auth/demo-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'c0000000-0000-0000-0000-000000000001' }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.status === 'ok' && data.data?.token) {
              const defaultUser: CustomerUser = {
                id: 'c0000000-0000-0000-0000-000000000001',
                phone: '+77011112233',
                roles: ['motorist'],
              };
              setToken(data.data.token);
              setUser(defaultUser);
              localStorage.setItem(STORAGE_TOKEN_KEY, data.data.token);
              localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(defaultUser));
              refreshActiveState(data.data.token);
            }
          })
          .catch(() => {
            setActiveState({ type: 'IDLE' });
          });
      }
    } catch {
      // Ignored
    } finally {
      setIsLoadingSession(false);
    }
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

    const { token: newToken, user: newUser } = data.data;
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem(STORAGE_TOKEN_KEY, newToken);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser));

    await refreshActiveState(newToken);
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
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem(STORAGE_TOKEN_KEY, newToken);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser));

    await refreshActiveState(newToken);
    return newUser;
  };

  const logout = () => {
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
