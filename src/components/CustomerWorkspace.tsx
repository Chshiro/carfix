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
  // 1. Session & Auth (Phase 1)
  const {
    token: sessionToken,
    user: sessionUser,
    activeState,
    loginWithPhone,
  } = useCustomerSession();

  const activeAuthToken = sessionToken || initialToken;

  // 2. Request Form State
  const [category, setCategory] = useState<ServiceCategory>('electrical_starting');
  const [selectedVehicle, setSelectedVehicle] = useState<string>(POPULAR_ASTANA_CARS[0]);
  const [customVehicle, setCustomVehicle] = useState<string>('');
  const [coords, setCoords] = useState<MapCoords>({ lat: 51.1283, lng: 71.4305 });
  const [locationName, setLocationName] = useState<string>('Монумент Байтерек (Левый берег)');
  const [description, setDescription] = useState<string>('');
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [selectingOfferId, setSelectingOfferId] = useState<string | null>(null);

  // 3. Toasts & Notifications (Phase 5)
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; icon?: string }>>([]);
  const addToast = useCallback((text: string, icon: string = '⚡') => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, text, icon }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // 4. Modals: Phone Auth & Order History (Phase 1 & Phase 4)
  const [showPhoneModal, setShowPhoneModal] = useState<boolean>(false);
  const [phoneInput, setPhoneInput] = useState<string>('+7 (701) 111-22-33');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [historyOrders, setHistoryOrders] = useState<CustomerHistoryOrder[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // 5. Review & Rating State (Phase 3)
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('Отличная работа, мастер приехал вовремя!');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [reviewSubmitted, setReviewSubmitted] = useState<boolean>(false);

  // 6. Cancel Modal State (Phase 3)
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('Машина завелась сама');

  // 7. Payment & Escrow Modal State (Stage 3 Fintech)
  const [pendingPaymentOffer, setPendingPaymentOffer] = useState<OfferItem | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'KASPI_QR' | 'BANK_CARD' | 'CASH'>('KASPI_QR');
  const [isHoldingPayment, setIsHoldingPayment] = useState<boolean>(false);

  // 8. Dispute Modal State (Stage 1 Operations)
  const [showDisputeModal, setShowDisputeModal] = useState<boolean>(false);
  const [disputeReason, setDisputeReason] = useState<string>('Мастер опоздал или не выполнил заявку');
  const [isSubmittingDispute, setIsSubmittingDispute] = useState<boolean>(false);

  // Track previous status to trigger Toasts on status transitions
  const prevOrderStatusRef = useRef<string | null>(null);
  const prevOffersCountRef = useRef<number>(0);

  // Hydrate active state from useCustomerSession when activeState arrives
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

  // Create Service Request
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
          category,
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
        addToast('Заявка опубликована! Ищем мастеров в радиусе 5 км...', '📡');
      } else {
        addToast(`Ошибка создания заявки: ${data.error?.message || 'Сбой'}`, '❌');
      }
    } catch (e: unknown) {
      addToast(`Сбой сети: ${e instanceof Error ? e.message : 'Error'}`, '❌');
    } finally {
      setIsPublishing(false);
    }
  };

  // Phase 2: Live Radar Auto-Polling for Offers (every 3 seconds)
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
          addToast(`Поступило новое предложение от мастера! (${data.data.length})`, '⚡');
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

  // Phase 2: Live Status Auto-Polling for Active Order (every 2.5 seconds)
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
            if (newStatus === 'COMPLETED') addToast('🎉 Заказ успешно завершен! Пожалуйста, оставьте отзыв', '⭐');
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

  // Phase 3: Select Offer Action
  // Phase 3: Select Offer Action
  const handleSelectOffer = async (offerId: string) => {
    if (!createdRequestId || !activeAuthToken) return;
    setSelectingOfferId(offerId);
    try {
      const res = await fetch(`/api/requests/${createdRequestId}/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeAuthToken}`,
        },
        body: JSON.stringify({ offerId }),
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setSelectedOrderResult(data.data as OrderResult);
        addToast('Мастер успешно выбран! Заказ оформлен', '✓');
      } else {
        addToast(`Ошибка выбора мастера: ${data.error?.message || 'Сбой'}`, '❌');
      }
    } catch (e: unknown) {
      addToast(`Сбой сети: ${e instanceof Error ? e.message : 'Error'}`, '❌');
    } finally {
      setSelectingOfferId(null);
    }
  };

  // Stage 3 Fintech: Confirm Payment & Create Escrow Hold
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

  // Stage 1 Operations: Submit Dispute
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
        addToast('⚖️ Спор успешно передан в службу арбитража CarFix!', '⚖️');
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

  // Phase 3: Direct Review Submission
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
        addToast('Спасибо за оценку! Отзыв сохранен', '⭐');
      } else {
        addToast(`Ошибка отправки отзыва: ${data.error?.message || 'Сбой'}`, '❌');
      }
    } catch (e: unknown) {
      addToast(`Сбой сети: ${e instanceof Error ? e.message : 'Error'}`, '❌');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Phase 3: Cancel Order Action
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

  // Phase 4: Fetch Order History
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

  // Phone Login Submit
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput.trim()) return;
    setIsLoggingIn(true);
    try {
      await loginWithPhone(phoneInput.trim());
      setShowPhoneModal(false);
      addToast(`Успешный вход в аккаунт ${phoneInput.trim()}`, '📱');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Ошибка входа', '❌');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const currentStatus = selectedOrderResult?.order.status;
  const masterPhone = selectedOrderResult?.provider.phone || '+77011110001';
  const cleanMasterPhone = masterPhone.replace(/\D/g, '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
      {/* TOASTS CONTAINER (Phase 5) */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast-item">
            <span>{toast.icon}</span>
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      {/* 0. CUSTOMER TOP PROFILE & HISTORY BAR (Phase 1 & 4) */}
      <div
        className="glass-card"
        style={{
          padding: '0.85rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          background: 'rgba(15, 23, 42, 0.75)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6 0%, #10b981 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.9rem',
              fontWeight: 700,
            }}
          >
            🚗
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
              {sessionUser?.phone || '+7 (701) 111-22-33'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Клиентский профиль • Астана
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={handleOpenHistory}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
          >
            📋 Мои заказы
          </button>
          <button
            onClick={() => setShowPhoneModal(true)}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
          >
            📱 Сменить номер
          </button>
        </div>
      </div>

      {/* 1. ACTIVE ORDER CONFIRMED VIEW & DIRECT DISPATCH CARD (Phase 3) */}
      {selectedOrderResult ? (
        <div className="glass-card" style={{ padding: '2rem', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <span
                className={`badge ${
                  currentStatus === 'COMPLETED'
                    ? 'badge-emerald'
                    : currentStatus === 'CANCELLED'
                    ? 'badge-amber'
                    : 'badge-blue'
                }`}
                style={{ marginBottom: '0.5rem' }}
              >
                {currentStatus === 'COMPLETED'
                  ? '✓ Заказ выполнен'
                  : currentStatus === 'CANCELLED'
                  ? '✕ Заказ отменен'
                  : '⚡ Заказ в работе'}
              </span>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem' }}>
                {currentStatus === 'PROVIDER_SELECTED' && 'Мастер назначен! Ожидаем выезда'}
                {currentStatus === 'EN_ROUTE' && 'Мастер выехал к вам! 🚗'}
                {currentStatus === 'ARRIVED' && 'Мастер прибыл на место! 📍'}
                {currentStatus === 'IN_PROGRESS' && 'Мастер выполняет работы 🔧'}
                {currentStatus === 'COMPLETED' && 'Работы успешно завершены! 🎉'}
                {currentStatus === 'CANCELLED' && 'Заказ был отменен'}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                {currentStatus !== 'CANCELLED'
                  ? 'Точные координаты переданы назначенному мастеру'
                  : `Причина отмены: ${selectedOrderResult.order.cancellationReason || 'По согласованию'}`}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Сумма к оплате</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--emerald)' }}>
                {selectedOrderResult.order.finalAmountTiyn
                  ? `${(selectedOrderResult.order.finalAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                  : selectedOrderResult.order.agreedAmountTiyn
                  ? `${(selectedOrderResult.order.agreedAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                  : 'По прайсу'}
              </div>
            </div>
          </div>

          {/* MASTER DIRECT DISPATCH CARD (Phase 3) */}
          <div
            style={{
              marginTop: '1.5rem',
              padding: '1.25rem',
              background: 'rgba(15, 23, 42, 0.8)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-accent)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.6rem',
                  boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)',
                }}
              >
                👨‍🔧
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h4 style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                    {selectedOrderResult.provider.businessName}
                  </h4>
                  <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
                    ✓ Верифицирован
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  ⭐ {((selectedOrderResult.provider.rating || 490) / 100).toFixed(1)} • {selectedOrderResult.provider.providerType}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--emerald)', marginTop: '0.15rem' }}>
                  ⏱️ Время прибытия: ~{selectedOrderResult.offer.etaMinutes || 15} минут
                </div>
              </div>
            </div>

            {/* DIRECT CALL & WHATSAPP BUTTONS (Phase 3) */}
            {currentStatus !== 'CANCELLED' && currentStatus !== 'COMPLETED' && (
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <a
                  href={`tel:${cleanMasterPhone}`}
                  className="btn btn-emerald"
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  📞 Позвонить
                </a>
                <a
                  href={`https://wa.me/${cleanMasterPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: '#25D366', color: '#25D366' }}
                >
                  💬 WhatsApp
                </a>
              </div>
            )}
          </div>

          {/* STATUS TIMELINE BAR */}
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              <span style={{ color: currentStatus ? 'var(--primary)' : 'inherit', fontWeight: 600 }}>1. Назначен</span>
              <span style={{ color: ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'].includes(currentStatus || '') ? 'var(--primary)' : 'inherit', fontWeight: 600 }}>2. В пути</span>
              <span style={{ color: ['ARRIVED', 'IN_PROGRESS', 'COMPLETED'].includes(currentStatus || '') ? 'var(--primary)' : 'inherit', fontWeight: 600 }}>3. На месте</span>
              <span style={{ color: ['IN_PROGRESS', 'COMPLETED'].includes(currentStatus || '') ? 'var(--primary)' : 'inherit', fontWeight: 600 }}>4. Ремонт</span>
              <span style={{ color: currentStatus === 'COMPLETED' ? 'var(--emerald)' : 'inherit', fontWeight: 600 }}>5. Завершен</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: currentStatus === 'COMPLETED' ? 'var(--emerald)' : 'linear-gradient(90deg, #3b82f6, #10b981)',
                  width:
                    currentStatus === 'PROVIDER_SELECTED' ? '20%' :
                    currentStatus === 'EN_ROUTE' ? '40%' :
                    currentStatus === 'ARRIVED' ? '60%' :
                    currentStatus === 'IN_PROGRESS' ? '80%' :
                    currentStatus === 'COMPLETED' ? '100%' : '0%',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>

          {/* REVIEW FORM FOR COMPLETED ORDER (Phase 3) */}
          {currentStatus === 'COMPLETED' && (
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                🌟 Оцените качество работы мастера
              </h3>
              {reviewSubmitted ? (
                <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-sm)', color: '#6ee7b7', fontWeight: 600 }}>
                  ✓ Спасибо! Ваш отзыв успешно сохранен и влияет на рейтинг мастера в Астане.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      Ваша оценка (1-5 звезд):
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          style={{
                            background: reviewRating >= star ? 'var(--amber)' : 'rgba(255,255,255,0.1)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.5rem 1rem',
                            fontSize: '1.2rem',
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
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      Комментарий к отзыву:
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Напишите пару слов о скорости и качестве..."
                    />
                  </div>

                  <button
                    onClick={handleSubmitReview}
                    disabled={isSubmittingReview}
                    className="btn btn-emerald"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {isSubmittingReview ? 'Сохранение...' : 'Отправить отзыв'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CANCEL & DISPUTE BUTTONS (Phase 3 & Stage 1) */}
          {currentStatus !== 'COMPLETED' && currentStatus !== 'CANCELLED' && (
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <button
                onClick={() => setShowDisputeModal(true)}
                className="btn btn-secondary"
                style={{ borderColor: 'rgba(245, 158, 11, 0.5)', color: '#fcd34d', padding: '0.5rem 0.9rem', fontSize: '0.8rem' }}
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
                  style={{ width: '200px', padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                />
                <button
                  onClick={handleCancelOrder}
                  disabled={isCancelling}
                  className="btn btn-secondary"
                  style={{ borderColor: '#ef4444', color: '#f87171', padding: '0.5rem 0.9rem', fontSize: '0.8rem' }}
                >
                  {isCancelling ? 'Отмена...' : '✕ Отменить'}
                </button>
              </div>
            </div>
          )}

          {/* CREATE NEW REQUEST BUTTON IF FINISHED */}
          {(currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED') && (
            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <button
                onClick={() => {
                  setSelectedOrderResult(null);
                  setCreatedRequestId(null);
                  setOffers([]);
                  setReviewSubmitted(false);
                }}
                className="btn btn-primary"
              >
                ➕ Создать новую заявку
              </button>
            </div>
          )}
        </div>
      ) : (
        /* 2. CREATION & LIVE RADAR VIEW */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* REQUEST FORM */}
          <div className="glass-card" style={{ padding: '1.75rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.25rem' }}>
              📍 Вызов мастера в Астане
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Укажите причину поломки и выберите ориентир на карте для поиска ближайших экипажей
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Category Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Категория проблемы
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setCategory('electrical_starting')}
                    style={{
                      padding: '1rem',
                      textAlign: 'left',
                      borderRadius: 'var(--radius-md)',
                      border: category === 'electrical_starting' ? '2px solid var(--primary)' : '1px solid var(--border-subtle)',
                      background: category === 'electrical_starting' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>⚡</div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f8fafc' }}>Автоэлектрика</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Стартер, генератор, проводка</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategory('battery_jumpstart')}
                    style={{
                      padding: '1rem',
                      textAlign: 'left',
                      borderRadius: 'var(--radius-md)',
                      border: category === 'battery_jumpstart' ? '2px solid var(--emerald)' : '1px solid var(--border-subtle)',
                      background: category === 'battery_jumpstart' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🔋</div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f8fafc' }}>Прикурка АКБ</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Бустер 12V/24V, запуск в мороз</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategory('mobile_mechanic')}
                    style={{
                      padding: '1rem',
                      textAlign: 'left',
                      borderRadius: 'var(--radius-md)',
                      border: category === 'mobile_mechanic' ? '2px solid var(--amber)' : '1px solid var(--border-subtle)',
                      background: category === 'mobile_mechanic' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🔧</div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f8fafc' }}>Выездной механик</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Замена колеса, патрубки, ремни</div>
                  </button>
                </div>
              </div>

              {/* Vehicle Selector (Phase 4) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  🚗 Автомобиль
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
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
                      placeholder="Укажите марку и модель авто..."
                      value={customVehicle}
                      onChange={(e) => setCustomVehicle(e.target.value)}
                    />
                  )}
                </div>
              </div>

              {/* Map & Landmark Selector */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    Местоположение поломки: <span style={{ color: 'var(--primary)' }}>{locationName}</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={isLocating}
                    className="btn btn-secondary"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                  >
                    {isLocating ? 'Определение...' : '📍 Моё местоположение'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
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

                {/* Interactive Leaflet Map */}
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
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Что именно произошло? (Необязательно)
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Например: Не крутит стартер при повороте ключа, горит чек..."
                />
              </div>

              {/* Submit Button */}
              <button
                type="button"
                onClick={handleCreateRequest}
                disabled={isPublishing}
                className="btn btn-primary"
                style={{ padding: '0.9rem 1.5rem', fontSize: '1rem', fontWeight: 800 }}
              >
                {isPublishing ? 'Публикация заявки в Астане...' : '🚀 Опубликовать заявку'}
              </button>
            </div>
          </div>

          {/* LIVE RADAR & OFFERS LIST (Phase 2) */}
          {createdRequestId && (
            <div className="glass-card" style={{ padding: '1.75rem', border: '1px solid var(--border-accent)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {/* Radar Scanner Animation (Phase 2) */}
                  <div className="radar-scanner">
                    <div className="radar-sweep-line" />
                    <div style={{ fontSize: '1.5rem', zIndex: 2 }}>📡</div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="badge badge-blue">Поиск мастеров онлайн</span>
                      <span className="badge badge-emerald">Радиус: 5-15 км</span>
                    </div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.25rem' }}>
                      Радар поиска исполнителей
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Оповещены ближайшие экипажи в Астане. Предложения появляются в реальном времени.
                    </p>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Поступило откликов</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: offers.length > 0 ? 'var(--emerald)' : 'var(--amber)' }}>
                    {offers.length} {offers.length === 1 ? 'предложение' : offers.length >= 2 && offers.length <= 4 ? 'предложения' : 'предложений'}
                  </div>
                </div>
              </div>

              {/* OFFERS CARDS (Phase 2 & 3) */}
              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {offers.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(15, 23, 42, 0.5)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>⏳</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Ожидаем отклики мастеров...</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Переключитесь на вкладку «🔧 Мастер / СТО» вверху экрана, чтобы отправить тестовый оффер
                    </div>
                  </div>
                ) : (
                  offers.map((offer) => (
                    <div
                      key={offer.id}
                      className="glass-card"
                      style={{
                        padding: '1.25rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '1rem',
                        border: '1px solid var(--border-accent)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div
                          style={{
                            width: '46px',
                            height: '46px',
                            borderRadius: '12px',
                            background: 'rgba(59, 130, 246, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.4rem',
                          }}
                        >
                          🔧
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <h4 style={{ fontWeight: 800, fontSize: '1rem' }}>{offer.businessName}</h4>
                            <span className="badge badge-blue" style={{ fontSize: '0.65rem' }}>
                              {offer.providerType}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                            ⭐ {((offer.rating || 480) / 100).toFixed(1)} • {offer.completedJobs || 120} выездов • ⏱️ {offer.etaMinutes} мин
                          </div>
                          {offer.message && (
                            <div style={{ fontSize: '0.75rem', color: '#93c5fd', marginTop: '0.25rem', fontStyle: 'italic' }}>
                              &ldquo;{offer.message}&rdquo;
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {offer.pricingMode === 'fixed' ? 'Фиксированная цена' : 'Диагностика'}
                          </div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--emerald)' }}>
                            {offer.amountTiyn ? `${(offer.amountTiyn / 100).toLocaleString('ru-RU')} ₸` : 'По прайсу'}
                          </div>
                        </div>

                        <button
                          onClick={() => setPendingPaymentOffer(offer)}
                          disabled={selectingOfferId === offer.id || isHoldingPayment}
                          className="btn btn-emerald"
                          style={{ padding: '0.65rem 1.25rem', fontWeight: 800 }}
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

      {/* 3. PHONE AUTH MODAL (Phase 1) */}
      {showPhoneModal && (
        <div className="modal-overlay" onClick={() => setShowPhoneModal(false)}>
          <div
            className="glass-card"
            style={{ maxWidth: '420px', width: '100%', padding: '2rem', background: '#0e131f' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.25rem' }}>
              📱 Вход по номеру телефона
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              В режиме MVP вход происходит мгновенно без пароля с сохранением сессии в браузере.
            </p>

            <form onSubmit={handlePhoneSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Номер телефона в Казахстане:
                </label>
                <input
                  type="tel"
                  className="form-input"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="+7 (701) 000-00-00"
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  {isLoggingIn ? 'Вход...' : 'Войти в аккаунт'}
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
          </div>
        </div>
      )}

      {/* 4. ORDER HISTORY MODAL / DRAWER (Phase 4) */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div
            className="glass-card"
            style={{ maxWidth: '640px', width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: '2rem', background: '#0e131f' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                📋 История моих заказов в CarFix
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {isLoadingHistory ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Загрузка истории заказов...
              </div>
            ) : historyOrders.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                У вас пока нет завершенных заказов.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {historyOrders.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      padding: '1rem',
                      background: 'rgba(15, 23, 42, 0.8)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          className={`badge ${
                            order.status === 'COMPLETED' ? 'badge-emerald' : 'badge-amber'
                          }`}
                          style={{ fontSize: '0.65rem' }}
                        >
                          {order.status}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {new Date(order.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '0.25rem' }}>
                        {order.provider.businessName}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {order.category} {order.review ? `• Оценка: ⭐ ${order.review.rating}` : ''}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--emerald)' }}>
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

      {/* 5. PAYMENT & ESCROW MODAL (Stage 3 Fintech) */}
      {pendingPaymentOffer && (
        <div className="modal-overlay" onClick={() => setPendingPaymentOffer(null)}>
          <div
            className="glass-card"
            style={{ maxWidth: '460px', width: '100%', padding: '2rem', background: '#0e131f' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.25rem' }}>
              🛡️ Оплата & Escrow Гарантия CarFix
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Средства замораживаются на безопасном счете и будут выплачены мастеру только после выполнения работ.
            </p>

            {/* Provider summary */}
            <div style={{ padding: '0.85rem', background: 'rgba(15, 23, 42, 0.8)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', marginBottom: '1.25rem' }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{pendingPaymentOffer.businessName}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                ⏱️ Прибытие через: {pendingPaymentOffer.etaMinutes} мин
              </div>
            </div>

            {/* Price breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Услуга мастера (88%):</span>
                <span>{Math.round(((pendingPaymentOffer.amountTiyn || 500000) * 0.88) / 100).toLocaleString('ru-RU')} ₸</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Сервисный сбор CarFix (12%):</span>
                <span>{Math.round(((pendingPaymentOffer.amountTiyn || 500000) * 0.12) / 100).toLocaleString('ru-RU')} ₸</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem', fontWeight: 800, fontSize: '1.05rem', color: 'var(--emerald)' }}>
                <span>Итого к оплате:</span>
                <span>{((pendingPaymentOffer.amountTiyn || 500000) / 100).toLocaleString('ru-RU')} ₸</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Способ оплаты:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    border: paymentMethod === 'KASPI_QR' ? '2px solid #f59e0b' : '1px solid var(--border-subtle)',
                    background: paymentMethod === 'KASPI_QR' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(15, 23, 42, 0.6)',
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
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>🟡 Kaspi Pay (QR / Редирект)</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>0% комиссии, мгновенная заморозка</div>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    border: paymentMethod === 'BANK_CARD' ? '2px solid var(--primary)' : '1px solid var(--border-subtle)',
                    background: paymentMethod === 'BANK_CARD' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(15, 23, 42, 0.6)',
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
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>💳 Банковская карта (Visa / Mastercard)</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Безопасный интернет-эквайринг</div>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    border: paymentMethod === 'CASH' ? '2px solid var(--emerald)' : '1px solid var(--border-subtle)',
                    background: paymentMethod === 'CASH' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(15, 23, 42, 0.6)',
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
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>💵 Наличными мастеру</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Оплата по факту выполнения работ</div>
                  </div>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => handleConfirmPaymentAndSelect(pendingPaymentOffer)}
                disabled={isHoldingPayment}
                className="btn btn-emerald"
                style={{ flex: 1, padding: '0.8rem', fontWeight: 800 }}
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

      {/* 6. DISPUTE MODAL (Stage 1 Operations) */}
      {showDisputeModal && (
        <div className="modal-overlay" onClick={() => setShowDisputeModal(false)}>
          <div
            className="glass-card"
            style={{ maxWidth: '440px', width: '100%', padding: '2rem', background: '#0e131f' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.25rem' }}>
              ⚖️ Служба арбитража CarFix
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Опишите проблему. Администратор проверит детали заказа и вернет средства при подтверждении нарушения.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Причина спора / претензии:
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

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleSubmitDispute}
                  disabled={isSubmittingDispute}
                  className="btn btn-primary"
                  style={{ flex: 1, background: '#ef4444', borderColor: '#ef4444', fontWeight: 800 }}
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
