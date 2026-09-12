'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AstanaMap, { ASTANA_LANDMARKS, MapCoords, ProviderPin } from './AstanaMap';
import { useCustomerSession } from '../lib/useCustomerSession';

export type ServiceCategory = 'electrical_starting' | 'battery_jumpstart' | 'mobile_mechanic';
export type PricingMode = 'fixed' | 'diagnostic_fee' | 'estimate_range';

export interface OfferItem {
  id: string;
  providerId: string;
  businessName: string;
  providerType: string;
  verificationLevel: string;
  rating: number;
  completedJobs: number;
  pricingMode: PricingMode;
  amountTiyn: number | null;
  minAmountTiyn: number | null;
  maxAmountTiyn: number | null;
  etaMinutes: number;
  message: string | null;
  status: string;
}

export interface OrderResult {
  order: {
    id: string;
    status: string;
    agreedPricingMode: string;
    agreedAmountTiyn: number | null;
    agreedMinTiyn: number | null;
    agreedMaxTiyn: number | null;
    finalAmountTiyn?: number | null;
    cancellationReason?: string | null;
  };
  provider: {
    id: string;
    businessName: string;
    providerType: string;
    rating: number;
    phone?: string;
  };
  offer: {
    id: string;
    pricingMode: PricingMode;
    amountTiyn: number | null;
    minAmountTiyn: number | null;
    maxAmountTiyn: number | null;
    etaMinutes: number;
    message?: string | null;
  };
}

export interface CustomerHistoryOrder {
  id: string;
  requestId: string;
  status: string;
  category: string;
  description: string | null;
  agreedPricingMode: string;
  agreedAmountTiyn: number | null;
  finalAmountTiyn: number | null;
  cancellationReason: string | null;
  provider: {
    id: string;
    businessName: string;
    providerType: string;
    rating: number;
    phone: string;
  };
  review: {
    rating: number;
    comment: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export const POPULAR_ASTANA_CARS = [
  'Toyota Camry (XV70)',
  'Hyundai Tucson',
  'Kia Sportage',
  'Chevrolet Cobalt',
  'Lexus RX 350',
  'Hyundai Accent / Solaris',
  'Toyota Land Cruiser Prado',
  'BMW 5 Series',
  'Mercedes-Benz E-Class',
  'Другой автомобиль',
];

interface CustomerWorkspaceProps {
  token: string | null;
  createdRequestId: string | null;
  setCreatedRequestId: (id: string | null) => void;
  selectedOrderResult: OrderResult | null;
  setSelectedOrderResult: (res: OrderResult | null | ((prev: OrderResult | null) => OrderResult | null)) => void;
  onlineProviders: ProviderPin[];
}

export default function CustomerWorkspace({
  token: initialToken,
  createdRequestId,
  setCreatedRequestId,
  selectedOrderResult,
  setSelectedOrderResult,
  onlineProviders,
}: CustomerWorkspaceProps) {
  // 1. Session & Auth
  const {
    token: sessionToken,
    user: sessionUser,
    activeState,
    requestOtp,
    verifyOtp,
    loginWithPhone,
  } = useCustomerSession();

  const activeAuthToken = sessionToken || initialToken;

  // 2. Request Form State
  const [selectedSosKey, setSelectedSosKey] = useState<string>('battery');
  const [selectedVehicle, setSelectedVehicle] = useState<string>(POPULAR_ASTANA_CARS[0]);
  const [customVehicle, setCustomVehicle] = useState<string>('');
  const [coords, setCoords] = useState<MapCoords>({ lat: 51.1283, lng: 71.4305 });
  const [locationName, setLocationName] = useState<string>('Монумент Байтерек (Левый берег)');
  const [description, setDescription] = useState<string>('');
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [selectingOfferId, setSelectingOfferId] = useState<string | null>(null);

  // 3. Toasts & Notifications
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; icon?: string }>>([]);
  const addToast = useCallback((text: string, icon: string = '⚡') => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, text, icon }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // 4. Modals: Phone Auth & Order History
  const [showPhoneModal, setShowPhoneModal] = useState<boolean>(false);
  const [otpStep, setOtpStep] = useState<'phone' | 'otp'>('phone');
  const [phoneInput, setPhoneInput] = useState<string>('+7 (701) 111-22-33');
  const [otpCode, setOtpCode] = useState<string>('1111');
  const [isRequestingOtp, setIsRequestingOtp] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [historyOrders, setHistoryOrders] = useState<CustomerHistoryOrder[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // 5. Review & Rating State
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('Отличная работа, мастер приехал вовремя!');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [reviewSubmitted, setReviewSubmitted] = useState<boolean>(false);

  // 6. Cancel Modal State
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('Машина завелась сама');

  // 7. Payment & Escrow Modal State
  const [pendingPaymentOffer, setPendingPaymentOffer] = useState<OfferItem | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'KASPI_QR' | 'BANK_CARD' | 'CASH'>('KASPI_QR');
  const [isHoldingPayment, setIsHoldingPayment] = useState<boolean>(false);

  // 8. Dispute Modal State
  const [showDisputeModal, setShowDisputeModal] = useState<boolean>(false);
  const [disputeReason, setDisputeReason] = useState<string>('Мастер опоздал или не выполнил заявку');
  const [isSubmittingDispute, setIsSubmittingDispute] = useState<boolean>(false);

  // Track status transitions for Toasts
  const prevOrderStatusRef = useRef<string | null>(null);
  const prevOffersCountRef = useRef<number>(0);

  // Map user-friendly SOS keys to backend ServiceCategory
  const getBackendCategory = (key: string): ServiceCategory => {
    switch (key) {
      case 'battery':
        return 'battery_jumpstart';
      case 'tire':
      case 'lock':
        return 'mobile_mechanic';
      case 'tow':
      default:
        return 'electrical_starting';
    }
  };

  // Hydrate active state from useCustomerSession
  useEffect(() => {
    if (!activeState) return;

    if (activeState.type === 'ORDER' && activeState.order && activeState.provider && activeState.offer) {
      setSelectedOrderResult({
        order: {
          id: activeState.order.id,
          status: activeState.order.status,
          agreedPricingMode: activeState.order.agreedPricingMode,
          agreedAmountTiyn: activeState.order.agreedAmountTiyn,
          agreedMinTiyn: activeState.order.agreedMinTiyn,
          agreedMaxTiyn: activeState.order.agreedMaxTiyn,
          finalAmountTiyn: activeState.order.finalAmountTiyn,
          cancellationReason: activeState.order.cancellationReason,
        },
        provider: {
          id: activeState.provider.id,
          businessName: activeState.provider.businessName,
          providerType: activeState.provider.providerType,
          rating: activeState.provider.rating,
          phone: activeState.provider.phone,
        },
        offer: {
          id: activeState.offer.id,
          pricingMode: activeState.offer.pricingMode,
          amountTiyn: activeState.offer.amountTiyn,
          minAmountTiyn: activeState.offer.minAmountTiyn,
          maxAmountTiyn: activeState.offer.maxAmountTiyn,
          etaMinutes: activeState.offer.etaMinutes,
          message: activeState.offer.message,
        },
      });
      if (activeState.request) {
        setCreatedRequestId(activeState.request.id);
      }
      if (activeState.reviewSubmitted) {
        setReviewSubmitted(true);
      }
    } else if (activeState.type === 'REQUEST' && activeState.request) {
      setCreatedRequestId(activeState.request.id);
      if (activeState.offers) {
        setOffers(activeState.offers);
      }
    }
  }, [activeState, setCreatedRequestId, setSelectedOrderResult]);

  // Geolocation Handler
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      addToast('Геолокация не поддерживается вашим браузером', '⚠️');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(newCoords);
        setLocationName(`Координаты: ${newCoords.lat.toFixed(4)}, ${newCoords.lng.toFixed(4)}`);
        setIsLocating(false);
        addToast('Геопозиция успешно определена', '📍');
      },
      (err) => {
        addToast(`Не удалось определить геопозицию (${err.message})`, '⚠️');
        setIsLocating(false);
      }
    );
  };

  // Create SOS Service Request
  const handleCreateRequest = async () => {
    if (!activeAuthToken) {
      setShowPhoneModal(true);
      return;
    }
    setIsPublishing(true);

    const vehicleTitle = selectedVehicle === 'Другой автомобиль'
      ? (customVehicle.trim() || 'Легковой автомобиль')
      : selectedVehicle;

    const fullDescription = [
      `Авто: ${vehicleTitle}`,
      description.trim() ? `Проблема: ${description.trim()}` : '',
    ].filter(Boolean).join('\n');

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeAuthToken}`,
        },
        body: JSON.stringify({
          category: getBackendCategory(selectedSosKey),
          location: coords,
          description: fullDescription,
        }),
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setCreatedRequestId(data.data.requestId);
        setOffers([]);
        setSelectedOrderResult(null);
        setReviewSubmitted(false);
        addToast('Заявка принята! Оповещаем ближайших проверенных мастеров...', '📡');
      } else {
        addToast(`Ошибка создания заявки: ${data.error?.message || 'Сбой'}`, '❌');
      }
    } catch (e: unknown) {
      addToast(`Сбой сети: ${e instanceof Error ? e.message : 'Error'}`, '❌');
    } finally {
      setIsPublishing(false);
    }
  };

  // Live Auto-Polling for Offers (every 3 seconds)
  const fetchOffers = useCallback(async () => {
    if (!createdRequestId || !activeAuthToken || selectedOrderResult) return;
    try {
      const res = await fetch(`/api/requests/${createdRequestId}/offers`, {
        headers: { Authorization: `Bearer ${activeAuthToken}` },
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok' && Array.isArray(data.data)) {
        setOffers(data.data);
        if (data.data.length > prevOffersCountRef.current) {
          addToast(`⚡ Поступило новое предложение от мастера! (${data.data.length})`, '👨‍🔧');
        }
        prevOffersCountRef.current = data.data.length;
      }
    } catch (e) {
      console.error('Error polling offers:', e);
    }
  }, [createdRequestId, activeAuthToken, selectedOrderResult, addToast]);

  useEffect(() => {
    if (!createdRequestId || selectedOrderResult) return;
    fetchOffers();
    const interval = setInterval(fetchOffers, 3000);
    return () => clearInterval(interval);
  }, [createdRequestId, selectedOrderResult, fetchOffers]);

  // Live Status Polling for Active Order (every 2.5 seconds)
  const selectedOrderId = selectedOrderResult?.order.id;

  useEffect(() => {
    if (!selectedOrderId || !activeAuthToken) return;

    const pollOrder = async () => {
      try {
        const res = await fetch(`/api/orders/${selectedOrderId}`, {
          headers: { Authorization: `Bearer ${activeAuthToken}` },
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok' && data.data?.order) {
          const newStatus = data.data.order.status;

          // Status Change Toasts
          if (prevOrderStatusRef.current && prevOrderStatusRef.current !== newStatus) {
            if (newStatus === 'EN_ROUTE') addToast('🚗 Мастер выехал к вашему автомобилю!', '🚗');
            if (newStatus === 'ARRIVED') addToast('📍 Мастер прибыл на место встречи!', '📍');
            if (newStatus === 'IN_PROGRESS') addToast('🔧 Мастер приступил к ремонту!', '🔧');
            if (newStatus === 'COMPLETED') addToast('🎉 Заказ успешно завершен! Пожалуйста, оцените работу мастера', '⭐');
            if (newStatus === 'CANCELLED') addToast('✕ Заказ отменен', '⚠️');
          }
          prevOrderStatusRef.current = newStatus;

          setSelectedOrderResult((prev) =>
            prev
              ? {
                  ...prev,
                  order: {
                    ...prev.order,
                    status: newStatus,
                    finalAmountTiyn: data.data.order.finalAmountTiyn,
                    cancellationReason: data.data.order.cancellationReason,
                  },
                }
              : null
          );
        }
      } catch (e) {
        console.error('Error polling order status:', e);
      }
    };

    pollOrder();
    const interval = setInterval(pollOrder, 2500);
    return () => clearInterval(interval);
  }, [selectedOrderId, activeAuthToken, setSelectedOrderResult, addToast]);

  // Confirm Payment & Select Master via Escrow Hold
  const handleConfirmPaymentAndSelect = async (offer: OfferItem) => {
    if (!createdRequestId || !activeAuthToken) return;
    setIsHoldingPayment(true);
    try {
      // 1. Select master offer
      const res = await fetch(`/api/requests/${createdRequestId}/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeAuthToken}`,
        },
        body: JSON.stringify({ offerId: offer.id }),
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        const orderRes = data.data as OrderResult;
        setSelectedOrderResult(orderRes);

        // 2. Create Escrow Hold
        const amountTiyn = offer.amountTiyn || offer.minAmountTiyn || 500000;
        await fetch('/api/payments/hold', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeAuthToken}`,
          },
          body: JSON.stringify({
            orderId: orderRes.order.id,
            amountTiyn,
            paymentMethod,
          }),
        });

        addToast(`🛡️ Средства ${(amountTiyn / 100).toLocaleString('ru-RU')} ₸ заморожены через CarFix Escrow! Мастер оповещен`, '✓');
        setPendingPaymentOffer(null);
      } else {
        addToast(`Ошибка: ${data.error?.message || 'Не удалось оформить заказ'}`, '❌');
      }
    } catch (err: unknown) {
      addToast(`Ошибка платежа: ${err instanceof Error ? err.message : 'Сбой'}`, '❌');
    } finally {
      setIsHoldingPayment(false);
    }
  };

  // Submit Dispute to Admin Arbitration
  const handleSubmitDispute = async () => {
    if (!selectedOrderResult || !activeAuthToken) return;
    if (!disputeReason.trim()) {
      addToast('Укажите причину претензии', '⚠️');
      return;
    }
    setIsSubmittingDispute(true);
    try {
      const res = await fetch('/api/admin/disputes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeAuthToken}`,
        },
        body: JSON.stringify({
          orderId: selectedOrderResult.order.id,
          reason: disputeReason.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        addToast('⚖️ Претензия передана дежурному администратору CarFix!', '⚖️');
        setShowDisputeModal(false);
      } else {
        addToast(`Ошибка: ${data.error?.message || 'Сбой создания спора'}`, '❌');
      }
    } catch {
      addToast('Сбой сети при отправке спора', '❌');
    } finally {
      setIsSubmittingDispute(false);
    }
  };

  // Submit Customer Review
  const handleSubmitReview = async () => {
    if (!selectedOrderResult || !activeAuthToken) return;
    setIsSubmittingReview(true);
    try {
      const res = await fetch(`/api/orders/${selectedOrderResult.order.id}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeAuthToken}`,
        },
        body: JSON.stringify({
          rating: reviewRating,
          comment: reviewComment ? reviewComment.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setReviewSubmitted(true);
        addToast('Благодарим за оценку! Ваш отзыв сохранен', '⭐');
      } else {
        addToast(`Ошибка отправки отзыва: ${data.error?.message || 'Сбой'}`, '❌');
      }
    } catch (e: unknown) {
      addToast(`Сбой сети: ${e instanceof Error ? e.message : 'Error'}`, '❌');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Cancel Order
  const handleCancelOrder = async () => {
    if (!selectedOrderResult || !activeAuthToken) return;
    if (!cancelReason.trim()) {
      addToast('Укажите причину отмены', '⚠️');
      return;
    }
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/orders/${selectedOrderResult.order.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeAuthToken}`,
        },
        body: JSON.stringify({
          status: 'CANCELLED',
          cancellationReason: cancelReason.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setSelectedOrderResult((prev) =>
          prev
            ? {
                ...prev,
                order: {
                  ...prev.order,
                  status: 'CANCELLED',
                  cancellationReason: cancelReason.trim(),
                },
              }
            : null
        );
        addToast('Заказ успешно отменен', '✓');
      } else {
        addToast(`Ошибка отмены: ${data.error?.message || 'Сбой'}`, '❌');
      }
    } catch (e: unknown) {
      addToast(`Сбой сети: ${e instanceof Error ? e.message : 'Error'}`, '❌');
    } finally {
      setIsCancelling(false);
    }
  };

  // Fetch Order History
  const handleOpenHistory = async () => {
    setShowHistoryModal(true);
    if (!activeAuthToken) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/customer/orders', {
        headers: { Authorization: `Bearer ${activeAuthToken}` },
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setHistoryOrders(data.data);
      }
    } catch (e) {
      console.error('Error fetching history:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Request OTP Submit
  const handleRequestOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput.trim()) return;
    setIsRequestingOtp(true);
    try {
      const res = await requestOtp(phoneInput.trim());
      setOtpStep('otp');
      if (res.demoCode) {
        setOtpCode(res.demoCode);
      }
      addToast(res.message || 'SMS-код отправлен', '📩');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Ошибка отправки SMS', '❌');
    } finally {
      setIsRequestingOtp(false);
    }
  };

  // Verify OTP Submit
  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;
    setIsLoggingIn(true);
    try {
      await verifyOtp(phoneInput.trim(), otpCode.trim());
      setShowPhoneModal(false);
      setOtpStep('phone');
      addToast(`Успешный вход: ${phoneInput.trim()}`, '📱');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Неверный код', '❌');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const currentStatus = selectedOrderResult?.order.status;
  const masterPhone = selectedOrderResult?.provider.phone || '+77011110001';
  const cleanMasterPhone = masterPhone.replace(/\D/g, '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', position: 'relative' }}>
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast-item">
            <span style={{ fontSize: '1.25rem' }}>{toast.icon}</span>
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      {/* 0. TOP PROFILE & CONCIERGE BAR */}
      <div
        className="glass-card"
        style={{
          padding: '1.1rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: '#111C33',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
              fontWeight: 800,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
            }}
          >
            🚗
          </div>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF' }}>
              {sessionUser?.phone || '+7 (701) 111-22-33'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Водительский аккаунт &bull; Астана
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <button
            onClick={handleOpenHistory}
            className="btn btn-secondary"
            style={{ padding: '0.6rem 1.1rem', fontSize: '0.9rem' }}
          >
            📋 Мои заказы
          </button>
          <button
            onClick={() => setShowPhoneModal(true)}
            className="btn btn-secondary"
            style={{ padding: '0.6rem 1.1rem', fontSize: '0.9rem' }}
          >
            📱 Сменить номер
          </button>
        </div>
      </div>

      {/* 1. ACTIVE ORDER & MASTER CARD (Phase 3 & Human-First) */}
      {selectedOrderResult ? (
        <div className="glass-card" style={{ padding: '2.25rem', border: '2px solid var(--aquamarine)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem' }}>
            <div>
              <span
                className={`badge ${
                  currentStatus === 'COMPLETED'
                    ? 'badge-emerald'
                    : currentStatus === 'CANCELLED'
                    ? 'badge-amber'
                    : 'badge-aquamarine'
                }`}
                style={{ marginBottom: '0.65rem' }}
              >
                {currentStatus === 'COMPLETED'
                  ? '✓ Заказ выполнен'
                  : currentStatus === 'CANCELLED'
                  ? '✕ Заказ отменен'
                  : '⚡ Заказ в работе'}
              </span>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 900, marginTop: '0.35rem', letterSpacing: '-0.02em' }}>
                {currentStatus === 'PROVIDER_SELECTED' && 'Мастер назначен! Ожидаем выезда'}
                {currentStatus === 'EN_ROUTE' && 'Мастер выехал к вам! 🚗'}
                {currentStatus === 'ARRIVED' && 'Мастер прибыл на место! 📍'}
                {currentStatus === 'IN_PROGRESS' && 'Мастер выполняет ремонт 🔧'}
                {currentStatus === 'COMPLETED' && 'Работы успешно завершены! 🎉'}
                {currentStatus === 'CANCELLED' && 'Заказ был отменен'}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginTop: '0.35rem' }}>
                {currentStatus !== 'CANCELLED'
                  ? 'Экипаж движется по координатам вашего автомобиля'
                  : `Причина отмены: ${selectedOrderResult.order.cancellationReason || 'По согласованию'}`}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Сумма к оплате</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--aquamarine-bright)' }}>
                {selectedOrderResult.order.finalAmountTiyn
                  ? `${(selectedOrderResult.order.finalAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                  : selectedOrderResult.order.agreedAmountTiyn
                  ? `${(selectedOrderResult.order.agreedAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                  : 'По согласованию'}
              </div>
            </div>
          </div>

          {/* MASTER HUMAN-CENTRIC CARD */}
          <div
            style={{
              marginTop: '1.75rem',
              padding: '1.5rem',
              background: '#111C33',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-card)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div
                style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, #06B6D4 0%, #2563EB 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  boxShadow: '0 8px 24px var(--aquamarine-glow)',
                }}
              >
                👨‍🔧
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <h3 style={{ fontWeight: 900, fontSize: '1.35rem', color: '#FFFFFF' }}>
                    {selectedOrderResult.provider.businessName}
                  </h3>
                  <span className="badge badge-indigo" style={{ fontSize: '0.8rem' }}>
                    🛡️ Проверенный мастер
                  </span>
                </div>
                <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  ⭐ {((selectedOrderResult.provider.rating || 490) / 100).toFixed(1)} &bull; {selectedOrderResult.provider.providerType}
                </div>
                <div style={{ fontSize: '0.95rem', color: 'var(--aquamarine-bright)', fontWeight: 700, marginTop: '0.25rem' }}>
                  ⏱️ Время прибытия: ~{selectedOrderResult.offer.etaMinutes || 15} минут
                </div>
              </div>
            </div>

            {/* BIG ERGONOMIC TOUCH ACTION BUTTONS (Min height 54px) */}
            {currentStatus !== 'CANCELLED' && currentStatus !== 'COMPLETED' && (
              <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
                <a
                  href={`tel:${cleanMasterPhone}`}
                  className="btn-touch-action btn-aquamarine"
                >
                  📞 Позвонить мастеру
                </a>
                <a
                  href={`https://wa.me/${cleanMasterPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-touch-action btn-secondary"
                  style={{ borderColor: '#25D366', color: '#25D366', background: 'rgba(37, 211, 102, 0.1)' }}
                >
                  💬 Написать в WhatsApp
                </a>
              </div>
            )}
          </div>

          {/* ESCROW SECURITY GUARANTEE BANNER */}
          <div
            style={{
              marginTop: '1.25rem',
              padding: '1rem 1.25rem',
              background: 'linear-gradient(135deg, rgba(67, 56, 202, 0.25) 0%, rgba(37, 99, 235, 0.15) 100%)',
              border: '1px solid var(--indigo-light)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <span style={{ fontSize: '1.8rem' }}>🛡️</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#C7D2FE' }}>
                Гарантия безопасности CarFix: ₸ заморожены до конца ремонта
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                Мастер получит выплату только после того, как вы подтвердите завершение и качество работы.
              </div>
            </div>
          </div>

          {/* STATUS PROGRESS BAR */}
          <div style={{ marginTop: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
              <span style={{ color: currentStatus ? 'var(--aquamarine-bright)' : 'inherit', fontWeight: 700 }}>1. Назначен</span>
              <span style={{ color: ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'].includes(currentStatus || '') ? 'var(--aquamarine-bright)' : 'inherit', fontWeight: 700 }}>2. В пути</span>
              <span style={{ color: ['ARRIVED', 'IN_PROGRESS', 'COMPLETED'].includes(currentStatus || '') ? 'var(--aquamarine-bright)' : 'inherit', fontWeight: 700 }}>3. На месте</span>
              <span style={{ color: ['IN_PROGRESS', 'COMPLETED'].includes(currentStatus || '') ? 'var(--aquamarine-bright)' : 'inherit', fontWeight: 700 }}>4. Ремонт</span>
              <span style={{ color: currentStatus === 'COMPLETED' ? '#10B981' : 'inherit', fontWeight: 700 }}>5. Готово</span>
            </div>
            <div style={{ width: '100%', height: '10px', background: '#0D1627', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
              <div
                style={{
                  height: '100%',
                  background: currentStatus === 'COMPLETED' ? '#10B981' : 'linear-gradient(90deg, #2563EB, #06B6D4)',
                  width:
                    currentStatus === 'PROVIDER_SELECTED' ? '20%' :
                    currentStatus === 'EN_ROUTE' ? '40%' :
                    currentStatus === 'ARRIVED' ? '60%' :
                    currentStatus === 'IN_PROGRESS' ? '80%' :
                    currentStatus === 'COMPLETED' ? '100%' : '0%',
                  transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: '0 0 12px var(--aquamarine-glow)',
                }}
              />
            </div>
          </div>

          {/* REVIEW FORM FOR COMPLETED ORDER */}
          {currentStatus === 'COMPLETED' && (
            <div style={{ marginTop: '2rem', padding: '1.75rem', background: 'rgba(6, 182, 212, 0.08)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--aquamarine)' }}>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 900, marginBottom: '0.65rem' }}>
                🌟 Оцените работу мастера
              </h3>
              {reviewSubmitted ? (
                <div style={{ padding: '1.15rem', background: 'rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-md)', color: '#A7F3D0', fontWeight: 700, fontSize: '1rem' }}>
                  ✓ Спасибо! Ваш отзыв сохранен и помогает поддерживать высокое качество сервиса в Астане.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                      Оценка работы:
                    </label>
                    <div style={{ display: 'flex', gap: '0.65rem' }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          style={{
                            background: reviewRating >= star ? 'var(--amber)' : '#152238',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '10px',
                            padding: '0.65rem 1.25rem',
                            fontSize: '1.35rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          ⭐ {star}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                      Ваш комментарий:
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Напишите пару слов о скорости прибытия и качестве..."
                    />
                  </div>

                  <button
                    onClick={handleSubmitReview}
                    disabled={isSubmittingReview}
                    className="btn btn-aquamarine"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {isSubmittingReview ? 'Сохранение...' : 'Отправить отзыв'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CANCEL & DISPUTE BUTTONS */}
          {currentStatus !== 'COMPLETED' && currentStatus !== 'CANCELLED' && (
            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <button
                onClick={() => setShowDisputeModal(true)}
                className="btn btn-secondary"
                style={{ borderColor: 'var(--amber)', color: '#FDE68A', padding: '0.65rem 1.15rem' }}
              >
                ⚖️ Открыть спор / Претензия
              </button>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Причина отмены..."
                  style={{ width: '220px', padding: '0.65rem 0.95rem', fontSize: '0.9rem' }}
                />
                <button
                  onClick={handleCancelOrder}
                  disabled={isCancelling}
                  className="btn btn-secondary"
                  style={{ borderColor: '#F43F5E', color: '#FDA4AF', padding: '0.65rem 1.15rem' }}
                >
                  {isCancelling ? 'Отмена...' : '✕ Отменить'}
                </button>
              </div>
            </div>
          )}

          {/* CREATE NEW REQUEST BUTTON */}
          {(currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED') && (
            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
              <button
                onClick={() => {
                  setSelectedOrderResult(null);
                  setCreatedRequestId(null);
                  setOffers([]);
                  setReviewSubmitted(false);
                }}
                className="btn btn-primary"
                style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
              >
                ➕ Создать новую заявку
              </button>
            </div>
          )}
        </div>
      ) : (
        /* 2. CREATION & LIVE RADAR VIEW */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* FRIENDLY SOS START FORM */}
          <div className="glass-card" style={{ padding: '2.25rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.65rem', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                🚗 Вызов автопомощи на дорогу в Астане
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', marginTop: '0.35rem' }}>
                Выберите проблему в 1 клик — дежурные экипажи свяжутся с вами в течение 2 минут
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              {/* SOS PROBLEM SELECTOR CARDS */}
              <div>
                <label style={{ display: 'block', fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem', color: '#FFFFFF' }}>
                  Что у вас случилось?
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  {/* Option 1: Battery */}
                  <div
                    onClick={() => setSelectedSosKey('battery')}
                    className={`sos-card ${selectedSosKey === 'battery' ? 'selected' : ''}`}
                  >
                    <div className="sos-card-icon">🔋</div>
                    <div className="sos-card-title">Сел аккумулятор</div>
                    <div className="sos-card-desc">Прикурить бустером 12V/24V, запуск в мороз</div>
                  </div>

                  {/* Option 2: Tire */}
                  <div
                    onClick={() => setSelectedSosKey('tire')}
                    className={`sos-card ${selectedSosKey === 'tire' ? 'selected' : ''}`}
                  >
                    <div className="sos-card-icon">🛞</div>
                    <div className="sos-card-title">Спустило колесо</div>
                    <div className="sos-card-desc">Замена на запаску, мобильный шиномонтаж</div>
                  </div>

                  {/* Option 3: Tow / Stuck */}
                  <div
                    onClick={() => setSelectedSosKey('tow')}
                    className={`sos-card ${selectedSosKey === 'tow' ? 'selected' : ''}`}
                  >
                    <div className="sos-card-icon">🪝</div>
                    <div className="sos-card-title">Не заводится / Эвакуатор</div>
                    <div className="sos-card-desc">Автоэлектрик, буксировка или эвакуатор</div>
                  </div>

                  {/* Option 4: Door Lock */}
                  <div
                    onClick={() => setSelectedSosKey('lock')}
                    className={`sos-card ${selectedSosKey === 'lock' ? 'selected' : ''}`}
                  >
                    <div className="sos-card-icon">🔑</div>
                    <div className="sos-card-title">Захлопнулась дверь</div>
                    <div className="sos-card-desc">Аварийное вскрытие без повреждения замков</div>
                  </div>
                </div>
              </div>

              {/* Vehicle Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '1rem', fontWeight: 800, marginBottom: '0.65rem', color: '#FFFFFF' }}>
                  🚗 Ваш автомобиль
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                  <select
                    className="form-select"
                    value={selectedVehicle}
                    onChange={(e) => setSelectedVehicle(e.target.value)}
                  >
                    {POPULAR_ASTANA_CARS.map((car) => (
                      <option key={car} value={car}>
                        {car}
                      </option>
                    ))}
                  </select>

                  {selectedVehicle === 'Другой автомобиль' && (
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Например: Chery Tiggo 7 Pro, серый..."
                      value={customVehicle}
                      onChange={(e) => setCustomVehicle(e.target.value)}
                    />
                  )}
                </div>
              </div>

              {/* Map & Landmark Selector */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <label style={{ fontSize: '1rem', fontWeight: 800, color: '#FFFFFF' }}>
                    Ориентир на карте: <span style={{ color: 'var(--aquamarine-bright)' }}>{locationName}</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={isLocating}
                    className="btn btn-secondary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  >
                    {isLocating ? 'Определение...' : '📍 Моё местоположение'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  {ASTANA_LANDMARKS.map((landmark) => (
                    <button
                      key={landmark.name}
                      type="button"
                      onClick={() => {
                        setCoords({ lat: landmark.lat, lng: landmark.lng });
                        setLocationName(landmark.name);
                      }}
                      className={`chip ${locationName === landmark.name ? 'active' : ''}`}
                    >
                      {landmark.name}
                    </button>
                  ))}
                </div>

                {/* Leaflet Astana Map */}
                <AstanaMap
                  center={coords}
                  radiusKm={5}
                  onLocationChange={(newCoords, name) => {
                    setCoords(newCoords);
                    setLocationName(name || `Точка: ${newCoords.lat.toFixed(4)}, ${newCoords.lng.toFixed(4)}`);
                  }}
                  providerPins={onlineProviders}
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', fontSize: '1rem', fontWeight: 800, marginBottom: '0.5rem', color: '#FFFFFF' }}>
                  Уточняющие детали (Необязательно)
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Например: Стою возле въезда на паркинг Mega Silk Way, мигает аварийка..."
                />
              </div>

              {/* SOS Trigger Button */}
              <button
                type="button"
                onClick={handleCreateRequest}
                disabled={isPublishing}
                className="btn btn-aquamarine"
                style={{ padding: '1.15rem 2rem', fontSize: '1.2rem', fontWeight: 900, borderRadius: 'var(--radius-md)' }}
              >
                {isPublishing ? 'Публикация заявки в Астане...' : '🚀 Вызвать мастера в Астане'}
              </button>
            </div>
          </div>

          {/* LIVE CARING RADAR & OFFERS LIST */}
          {createdRequestId && (
            <div className="glass-card" style={{ padding: '2.25rem', border: '1px solid var(--aquamarine)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  {/* Caring Radar Waves Animation */}
                  <div className="caring-radar">
                    <div className="caring-radar-circle" />
                    <div className="caring-radar-circle" />
                    <div className="caring-radar-circle" />
                    <div className="caring-radar-core">📡</div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span className="badge badge-aquamarine">Поиск мастеров онлайн</span>
                      <span className="badge badge-blue">Радиус: 5-15 км</span>
                    </div>
                    <h3 style={{ fontSize: '1.45rem', fontWeight: 900, marginTop: '0.35rem', color: '#FFFFFF' }}>
                      Связываемся с ближайшими автомеханиками...
                    </h3>
                    <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      Радар активен в районе {locationName}. Предложения с точной ценой появляются ниже.
                    </p>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Поступило откликов</div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: offers.length > 0 ? 'var(--aquamarine-bright)' : 'var(--amber)' }}>
                    {offers.length} {offers.length === 1 ? 'предложение' : offers.length >= 2 && offers.length <= 4 ? 'предложения' : 'предложений'}
                  </div>
                </div>
              </div>

              {/* OFFERS CARDS */}
              <div style={{ marginTop: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                {offers.length === 0 ? (
                  <div style={{ padding: '2.5rem', textAlign: 'center', background: '#111C33', borderRadius: 'var(--radius-lg)' }}>
                    <div style={{ fontSize: '2.2rem', marginBottom: '0.65rem' }}>⏳</div>
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#FFFFFF' }}>
                      Ожидаем подтверждения от экипажей...
                    </div>
                    <div style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                      Вы можете открыть вкладку «🔧 Мастер / СТО» вверху экрана, чтобы отправить тестовый отклик
                    </div>
                  </div>
                ) : (
                  offers.map((offer) => (
                    <div
                      key={offer.id}
                      className="glass-card"
                      style={{
                        padding: '1.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '1.25rem',
                        border: '1px solid var(--border-card)',
                        background: '#111C33',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        <div
                          style={{
                            width: '54px',
                            height: '54px',
                            borderRadius: '14px',
                            background: 'rgba(37, 99, 235, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.6rem',
                          }}
                        >
                          👨‍🔧
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <h4 style={{ fontWeight: 900, fontSize: '1.15rem', color: '#FFFFFF' }}>
                              {offer.businessName}
                            </h4>
                            <span className="badge badge-blue" style={{ fontSize: '0.75rem' }}>
                              {offer.providerType}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                            ⭐ {((offer.rating || 480) / 100).toFixed(1)} &bull; {offer.completedJobs || 120} выездов &bull; ⏱️ {offer.etaMinutes} мин
                          </div>
                          {offer.message && (
                            <div style={{ fontSize: '0.85rem', color: '#93C5FD', marginTop: '0.35rem', fontStyle: 'italic' }}>
                              &ldquo;{offer.message}&rdquo;
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {offer.pricingMode === 'fixed' ? 'Фиксированная цена' : 'Диагностика'}
                          </div>
                          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--aquamarine-bright)' }}>
                            {offer.amountTiyn ? `${(offer.amountTiyn / 100).toLocaleString('ru-RU')} ₸` : 'По согласованию'}
                          </div>
                        </div>

                        <button
                          onClick={() => setPendingPaymentOffer(offer)}
                          disabled={selectingOfferId === offer.id || isHoldingPayment}
                          className="btn btn-aquamarine"
                          style={{ padding: '0.85rem 1.6rem', fontWeight: 900 }}
                        >
                          {selectingOfferId === offer.id ? 'Выбор...' : 'Выбрать мастера'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. PHONE AUTH MODAL */}
      {showPhoneModal && (
        <div className="modal-overlay" onClick={() => setShowPhoneModal(false)}>
          <div
            className="glass-card"
            style={{ maxWidth: '440px', width: '100%', padding: '2.25rem', background: '#0D1627' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.45rem', fontWeight: 900, marginBottom: '0.35rem', color: '#FFFFFF' }}>
              📱 {otpStep === 'phone' ? 'Вход в CarFix' : 'Подтверждение номера'}
            </h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              {otpStep === 'phone'
                ? 'Безопасный вход по SMS-коду на номер любого мобильного оператора Казахстана.'
                : `Введите 4-значный код, отправленный на ${phoneInput}. В демо-режиме код: 1111.`}
            </p>

            {otpStep === 'phone' ? (
              <form onSubmit={handleRequestOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    Номер телефона:
                  </label>
                  <input
                    type="tel"
                    className="form-input"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="+7 (701) 000-00-00"
                    required
                  />
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    Поддерживаются номера Kcell, Activ, Beeline, Tele2, Altel (+7 7xx)
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.85rem', marginTop: '0.5rem' }}>
                  <button
                    type="submit"
                    disabled={isRequestingOtp}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    {isRequestingOtp ? 'Отправка...' : 'Получить SMS-код ➔'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPhoneModal(false)}
                    className="btn btn-secondary"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Код из SMS:
                    </label>
                    <button
                      type="button"
                      onClick={() => setOtpStep('phone')}
                      style={{ background: 'none', border: 'none', color: 'var(--aquamarine-bright)', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}
                    >
                      Изменить номер
                    </button>
                  </div>
                  <input
                    type="text"
                    maxLength={4}
                    className="form-input"
                    style={{ fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.5rem', fontWeight: 900 }}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="1111"
                    autoFocus
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.85rem', marginTop: '0.5rem' }}>
                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    {isLoggingIn ? 'Проверка...' : 'Войти в аккаунт'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtpStep('phone')}
                    className="btn btn-secondary"
                  >
                    Назад
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 4. ORDER HISTORY MODAL */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div
            className="glass-card"
            style={{ maxWidth: '680px', width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: '2.25rem', background: '#0D1627' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.45rem', fontWeight: 900, color: '#FFFFFF' }}>
                📋 История моих заказов
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.6rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {isLoadingHistory ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Загрузка истории...
              </div>
            ) : historyOrders.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                У вас пока нет оформленных заказов.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {historyOrders.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      padding: '1.25rem',
                      background: '#111C33',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <span
                          className={`badge ${
                            order.status === 'COMPLETED' ? 'badge-emerald' : 'badge-amber'
                          }`}
                          style={{ fontSize: '0.75rem' }}
                        >
                          {order.status}
                        </span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {new Date(order.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#FFFFFF', marginTop: '0.35rem' }}>
                        {order.provider.businessName}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        {order.category} {order.review ? `&bull; Оценка: ⭐ ${order.review.rating}` : ''}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--aquamarine-bright)' }}>
                        {order.finalAmountTiyn
                          ? `${(order.finalAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                          : order.agreedAmountTiyn
                          ? `${(order.agreedAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                          : '-'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. PAYMENT & ESCROW MODAL */}
      {pendingPaymentOffer && (
        <div className="modal-overlay" onClick={() => setPendingPaymentOffer(null)}>
          <div
            className="glass-card"
            style={{ maxWidth: '480px', width: '100%', padding: '2.25rem', background: '#0D1627' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.45rem', fontWeight: 900, marginBottom: '0.35rem', color: '#FFFFFF' }}>
              🛡️ Оплата & Escrow Гарантия
            </h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Средства замораживаются на безопасном счете и переводятся мастеру только после выполнения работ.
            </p>

            {/* Provider summary */}
            <div style={{ padding: '1rem', background: '#111C33', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-card)', marginBottom: '1.25rem' }}>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#FFFFFF' }}>{pendingPaymentOffer.businessName}</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                ⏱️ Прибытие через ~{pendingPaymentOffer.etaMinutes} мин
              </div>
            </div>

            {/* Price breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Услуга мастера (88%):</span>
                <span>{Math.round(((pendingPaymentOffer.amountTiyn || 500000) * 0.88) / 100).toLocaleString('ru-RU')} ₸</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Сервисный сбор CarFix (12%):</span>
                <span>{Math.round(((pendingPaymentOffer.amountTiyn || 500000) * 0.12) / 100).toLocaleString('ru-RU')} ₸</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.65rem', fontWeight: 900, fontSize: '1.25rem', color: 'var(--aquamarine-bright)' }}>
                <span>Итого к оплате:</span>
                <span>{((pendingPaymentOffer.amountTiyn || 500000) / 100).toLocaleString('ru-RU')} ₸</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.65rem', color: '#FFFFFF' }}>
                Способ оплаты:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85rem',
                    padding: '0.95rem',
                    borderRadius: 'var(--radius-md)',
                    border: paymentMethod === 'KASPI_QR' ? '2px solid #F59E0B' : '1px solid var(--border-card)',
                    background: paymentMethod === 'KASPI_QR' ? 'rgba(245, 158, 11, 0.12)' : '#111C33',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === 'KASPI_QR'}
                    onChange={() => setPaymentMethod('KASPI_QR')}
                  />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#FFFFFF' }}>🟡 Kaspi Pay (QR / Редирект)</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>0% комиссии, мгновенная заморозка</div>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85rem',
                    padding: '0.95rem',
                    borderRadius: 'var(--radius-md)',
                    border: paymentMethod === 'BANK_CARD' ? '2px solid var(--primary)' : '1px solid var(--border-card)',
                    background: paymentMethod === 'BANK_CARD' ? 'rgba(37, 99, 235, 0.12)' : '#111C33',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === 'BANK_CARD'}
                    onChange={() => setPaymentMethod('BANK_CARD')}
                  />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#FFFFFF' }}>💳 Банковская карта (Visa / Mastercard)</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Безопасный интернет-эквайринг</div>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85rem',
                    padding: '0.95rem',
                    borderRadius: 'var(--radius-md)',
                    border: paymentMethod === 'CASH' ? '2px solid var(--aquamarine)' : '1px solid var(--border-card)',
                    background: paymentMethod === 'CASH' ? 'rgba(6, 182, 212, 0.12)' : '#111C33',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === 'CASH'}
                    onChange={() => setPaymentMethod('CASH')}
                  />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#FFFFFF' }}>💵 Наличными мастеру</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Оплата по факту выполнения работ</div>
                  </div>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.85rem' }}>
              <button
                type="button"
                onClick={() => handleConfirmPaymentAndSelect(pendingPaymentOffer)}
                disabled={isHoldingPayment}
                className="btn btn-aquamarine"
                style={{ flex: 1, padding: '0.95rem', fontWeight: 900 }}
              >
                {isHoldingPayment ? 'Заморозка средств...' : '⚡ Оплатить и вызвать мастера'}
              </button>
              <button
                type="button"
                onClick={() => setPendingPaymentOffer(null)}
                className="btn btn-secondary"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. DISPUTE MODAL */}
      {showDisputeModal && (
        <div className="modal-overlay" onClick={() => setShowDisputeModal(false)}>
          <div
            className="glass-card"
            style={{ maxWidth: '460px', width: '100%', padding: '2.25rem', background: '#0D1627' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.45rem', fontWeight: 900, marginBottom: '0.35rem', color: '#FFFFFF' }}>
              ⚖️ Служба арбитража CarFix
            </h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Опишите проблему. Администратор проверит детали заказа и произведет возврат средств при подтверждении нарушения.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', color: '#FFFFFF' }}>
                  Причина претензии:
                </label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Опишите, что пошло не так (опоздание, некачественный ремонт, отказ от выполнения)..."
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '0.85rem' }}>
                <button
                  type="button"
                  onClick={handleSubmitDispute}
                  disabled={isSubmittingDispute}
                  className="btn btn-primary"
                  style={{ flex: 1, background: '#F43F5E', borderColor: '#F43F5E', fontWeight: 900 }}
                >
                  {isSubmittingDispute ? 'Отправка...' : 'Отправить жалобу'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDisputeModal(false)}
                  className="btn btn-secondary"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
