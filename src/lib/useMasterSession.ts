'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_MASTER_ID_KEY = 'carfix_active_master_id';

export interface MasterProfile {
  id: string;
  businessName: string;
  providerType: string;
  rating: number;
  completedJobs: number;
  verificationLevel: string;
  capabilities: string[];
}

export interface MasterAvailability {
  isOnline: boolean;
  location: { lat: number; lng: number };
  radiusKm: number;
  autoOfflineAt: string;
}

export interface NearbyRequestItem {
  id: string;
  category: string;
  description: string | null;
  location: { lat: number; lng: number };
  distanceKm: number;
  status: string;
  createdAt: string;
  expiresAt: string;
  myOffer: {
    id: string;
    pricingMode: 'fixed' | 'diagnostic_fee' | 'estimate_range';
    amountTiyn: number | null;
    etaMinutes: number;
    message: string | null;
    status: string;
  } | null;
}

export interface ActiveMasterOrder {
  id: string;
  status: string;
  agreedPricingMode: string;
  agreedAmountTiyn: number | null;
  finalAmountTiyn: number | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    phone: string;
  };
  request: {
    id: string;
    category: string;
    description: string | null;
    location: { lat: number; lng: number };
    createdAt: string;
  };
  offer: {
    id: string;
    pricingMode: string;
    amountTiyn: number | null;
    etaMinutes: number;
    message: string | null;
  };
}

export interface MasterShiftStats {
  todayGmvTiyn: number;
  totalGmvTiyn: number;
  todayOrdersCount: number;
  totalCompletedJobs: number;
  rating: number;
  orders: Array<{
    id: string;
    category: string;
    description: string | null;
    customerPhone: string;
    finalAmountTiyn: number;
    agreedPricingMode: string;
    completedAt: string;
    receivedReview: { rating: number; comment: string | null } | null;
    givenReview: { rating: number; comment: string | null } | null;
  }>;
}

export function useMasterSession(initialProviderId: string = 'b1000000-0000-0000-0000-000000000001') {
  const [providerId, setProviderId] = useState<string>(initialProviderId);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [availability, setAvailability] = useState<MasterAvailability | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveMasterOrder | null>(null);
  const [nearbyRequests, setNearbyRequests] = useState<NearbyRequestItem[]>([]);
  const [shiftStats, setShiftStats] = useState<MasterShiftStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshingRequests, setIsRefreshingRequests] = useState<boolean>(false);

  // Audio / Notification Ref
  const prevActiveOrderIdRef = useRef<string | null>(null);

  // Helper to fetch valid JWT token for provider
  const getProviderToken = useCallback(async (pId: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/demo-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: pId }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        return data.data.token as string;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Hydrate Active Master State
  const refreshMasterState = useCallback(async (authToken?: string) => {
    const currentToken = authToken || token;
    if (!currentToken) return;

    try {
      const res = await fetch('/api/master/active', {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok' && data.data) {
        setProfile(data.data.provider);
        setAvailability(data.data.availability);
        setActiveOrder(data.data.activeOrder);
      }
    } catch (e) {
      console.error('Error hydrating master state:', e);
    }
  }, [token]);

  // Fetch Nearby Requests Live Feed
  const fetchNearbyRequests = useCallback(async (authToken?: string) => {
    const currentToken = authToken || token;
    if (!currentToken) return;

    setIsRefreshingRequests(true);
    try {
      const res = await fetch('/api/master/requests', {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok' && Array.isArray(data.data)) {
        setNearbyRequests(data.data);
      }
    } catch (e) {
      console.error('Error fetching nearby requests:', e);
    } finally {
      setIsRefreshingRequests(false);
    }
  }, [token]);

  // Fetch Shift Stats
  const fetchShiftStats = useCallback(async (authToken?: string) => {
    const currentToken = authToken || token;
    if (!currentToken) return;

    try {
      const res = await fetch('/api/master/stats', {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok' && data.data) {
        setShiftStats(data.data);
      }
    } catch (e) {
      console.error('Error fetching shift stats:', e);
    }
  }, [token]);

  // Initialize or Switch Active Provider
  const switchProvider = useCallback(async (newProviderId: string) => {
    setIsLoading(true);
    setProviderId(newProviderId);
    localStorage.setItem(STORAGE_MASTER_ID_KEY, newProviderId);

    const newToken = await getProviderToken(newProviderId);
    if (newToken) {
      setToken(newToken);
      await Promise.all([
        refreshMasterState(newToken),
        fetchNearbyRequests(newToken),
        fetchShiftStats(newToken),
      ]);
    }
    setIsLoading(false);
  }, [getProviderToken, refreshMasterState, fetchNearbyRequests, fetchShiftStats]);

  // Initial mount load
  useEffect(() => {
    const savedId = localStorage.getItem(STORAGE_MASTER_ID_KEY) || initialProviderId;
    switchProvider(savedId);
  }, [initialProviderId, switchProvider]);

  // Auto-polling for nearby requests and active state (paused when tab hidden)
  useEffect(() => {
    if (!token) return;

    const poll = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      refreshMasterState();
      if (!activeOrder) {
        fetchNearbyRequests();
      }
    };

    const interval = setInterval(poll, 4500);

    return () => clearInterval(interval);
  }, [token, activeOrder, refreshMasterState, fetchNearbyRequests]);

  // Action: Toggle Online / Offline
  const toggleOnline = async (isOnline: boolean, location?: { lat: number; lng: number }) => {
    if (!token) return;
    const res = await fetch('/api/master/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ isOnline, location }),
    });

    const data = await res.json();
    if (res.ok && data.status === 'ok') {
      setAvailability((prev) => (prev ? { ...prev, isOnline: data.data.isOnline } : data.data));
      await fetchNearbyRequests();
    } else {
      throw new Error(data.error?.message || 'Ошибка переключения статуса');
    }
  };

  // Action: Update Location
  const updateLocation = async (lat: number, lng: number) => {
    if (!token) return;
    const res = await fetch('/api/master/location', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ location: { lat, lng } }),
    });

    const data = await res.json();
    if (res.ok && data.status === 'ok') {
      setAvailability((prev) => (prev ? { ...prev, location: data.data.location } : prev));
    }
  };

  // Action: Send Offer
  const sendOffer = async (payload: {
    requestId: string;
    pricingMode: 'fixed' | 'diagnostic_fee' | 'estimate_range';
    amountKzt?: number;
    minKzt?: number;
    maxKzt?: number;
    etaMinutes: number;
    message?: string;
  }) => {
    if (!token) throw new Error('Мастер не авторизован');

    const body: Record<string, unknown> = {
      requestId: payload.requestId,
      pricingMode: payload.pricingMode,
      etaMinutes: payload.etaMinutes,
      message: payload.message ? payload.message.trim() : undefined,
    };

    if (payload.pricingMode === 'fixed' || payload.pricingMode === 'diagnostic_fee') {
      body.amountTiyn = (payload.amountKzt || 0) * 100;
    } else {
      body.minAmountTiyn = (payload.minKzt || 0) * 100;
      body.maxAmountTiyn = (payload.maxKzt || 0) * 100;
    }

    const res = await fetch('/api/offers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok || data.status !== 'ok') {
      throw new Error(data.error?.message || 'Не удалось отправить предложение');
    }

    await Promise.all([refreshMasterState(), fetchNearbyRequests()]);
    return data.data;
  };

  // Action: Update Order Status (FSM Transitions)
  const updateOrderStatus = async (
    orderId: string,
    status: string,
    finalPriceKzt?: number,
    cancellationReason?: string
  ) => {
    if (!token) throw new Error('Мастер не авторизован');

    const body: Record<string, unknown> = { status };
    if (finalPriceKzt && finalPriceKzt > 0) {
      body.finalAmountTiyn = finalPriceKzt * 100;
    }
    if (cancellationReason && cancellationReason.trim()) {
      body.cancellationReason = cancellationReason.trim();
    }

    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok || data.status !== 'ok') {
      throw new Error(data.error?.message || 'Не удалось обновить статус заказа');
    }

    await Promise.all([refreshMasterState(), fetchShiftStats()]);
    return data.data;
  };

  // Action: Submit Review to Customer
  const submitReview = async (orderId: string, rating: number, comment?: string) => {
    if (!token) throw new Error('Мастер не авторизован');

    const res = await fetch(`/api/orders/${orderId}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        rating,
        comment: comment ? comment.trim() : undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.status !== 'ok') {
      throw new Error(data.error?.message || 'Не удалось отправить отзыв');
    }

    await fetchShiftStats();
    return data.data;
  };

  return {
    providerId,
    token,
    profile,
    availability,
    activeOrder,
    nearbyRequests,
    shiftStats,
    isLoading,
    isRefreshingRequests,
    switchProvider,
    toggleOnline,
    updateLocation,
    sendOffer,
    updateOrderStatus,
    submitReview,
    refreshMasterState,
    fetchNearbyRequests,
    fetchShiftStats,
  };
}
