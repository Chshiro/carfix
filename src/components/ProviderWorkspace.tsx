'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AstanaMap, { MapCoords, ProviderPin } from './AstanaMap';
import { useMasterSession, NearbyRequestItem } from '../lib/useMasterSession';
import { PricingMode, OrderResult } from './CustomerWorkspace';

export interface ProviderProfile {
  id: string;
  name: string;
  type: string;
  rating: number;
  completedJobs: number;
  capabilities: string[];
  radiusKm: number;
}

export const DEMO_PROVIDERS: ProviderProfile[] = [
  {
    id: 'b1000000-0000-0000-0000-000000000001',
    name: 'Мастер Азамат',
    type: 'Выездной автоэлектрик',
    rating: 4.9,
    completedJobs: 142,
    capabilities: ['Автоэлектрика', 'Прикурка АКБ', 'Диагностика'],
    radiusKm: 12,
  },
  {
    id: 'b2000000-0000-0000-0000-000000000002',
    name: 'СТО Барыс (Экипаж 1)',
    type: 'Мобильный техцентр',
    rating: 4.8,
    completedJobs: 98,
    capabilities: ['Диагностика', 'Электрика', 'Мелкий ремонт'],
    radiusKm: 15,
  },
  {
    id: 'b3000000-0000-0000-0000-000000000003',
    name: 'Срочная Прикурка Астана (Бауыржан)',
    type: 'Служба запуска АКБ',
    rating: 5.0,
    completedJobs: 310,
    capabilities: ['Прикурка 12V/24V', 'Доставка АКБ'],
    radiusKm: 15,
  },
  {
    id: 'b4000000-0000-0000-0000-000000000004',
    name: 'Мобильный Механик Данияр',
    type: 'Выездной мастер',
    rating: 4.7,
    completedJobs: 65,
    capabilities: ['Мелкий ремонт', 'Замена колеса', 'Патрубки/Ремни'],
    radiusKm: 10,
  },
];

interface ProviderWorkspaceProps {
  getDemoToken?: (userId?: string, providerId?: string) => Promise<string | null>;
  createdRequestId?: string | null;
  selectedOrderResult?: OrderResult | null;
  setSelectedOrderResult?: (res: OrderResult | null | ((prev: OrderResult | null) => OrderResult | null)) => void;
}

export default function ProviderWorkspace({
  createdRequestId,
  selectedOrderResult,
  setSelectedOrderResult,
}: ProviderWorkspaceProps) {
  // 1. Master Session Hook (Phase 1)
  const {
    providerId,
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
  } = useMasterSession();

  // 2. Toasts System (Phase 5)
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; icon?: string }>>([]);
  const addToast = useCallback((text: string, icon: string = '⚡') => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, text, icon }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // 3. Offer Bidding Modal State (Phase 2)
  const [biddingRequest, setBiddingRequest] = useState<NearbyRequestItem | null>(null);
  const [pricingMode, setPricingMode] = useState<PricingMode>('fixed');
  const [priceKzt, setPriceKzt] = useState<number>(5000);
  const [minPriceKzt, setMinPriceKzt] = useState<number>(8000);
  const [maxPriceKzt, setMaxPriceKzt] = useState<number>(15000);
  const [etaMinutes, setEtaMinutes] = useState<number>(15);
  const [offerMessage, setOfferMessage] = useState<string>('Выезжаю сразу со всем необходимым инструментом.');
  const [isSendingOffer, setIsSendingOffer] = useState<boolean>(false);

  // 4. Order Execution Actions State (Phase 3)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [finalPriceKzt, setFinalPriceKzt] = useState<number>(5000);
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('Клиент перестал отвечать на звонки');

  // 5. Mutual Review State (Phase 4)
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewTag, setReviewTag] = useState<string>('Вежливый и пунктуальный');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [reviewSubmitted, setReviewSubmitted] = useState<boolean>(false);

  // 6. Stats & History Modal (Phase 4)
  const [showStatsModal, setShowStatsModal] = useState<boolean>(false);

  // 7. Withdrawal Modal State (Stage 3 Fintech)
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  const [withdrawAmountKzt, setWithdrawAmountKzt] = useState<number>(5000);
  const [withdrawDestinationType, setWithdrawDestinationType] = useState<'KASPI_GOLD' | 'HALYK_BANK'>('KASPI_GOLD');
  const [withdrawCardNumber, setWithdrawCardNumber] = useState<string>('4400 4301 9988 1234');
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);

  // Handle Withdrawal Request
  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('carfix_demo_token');
    if (!token) {
      addToast('Сессия не найдена', '❌');
      return;
    }
    setIsWithdrawing(true);
    try {
      const res = await fetch('/api/payments/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amountTiyn: withdrawAmountKzt * 100,
          destinationType: withdrawDestinationType,
          destinationAccount: withdrawCardNumber.replace(/\s+/g, ''),
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        addToast(`✅ Выплата ${withdrawAmountKzt.toLocaleString('ru-RU')} ₸ успешно отправлена на ${withdrawDestinationType}!`, '💳');
        setShowWithdrawModal(false);
        refreshMasterState();
      } else {
        addToast(`Ошибка вывода: ${data.error?.message || 'Недостаточно средств'}`, '❌');
      }
    } catch {
      addToast('Сбой сети при запросе выплаты', '❌');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Track order assignment transition to trigger celebration toast
  const prevActiveOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeOrder?.id && prevActiveOrderIdRef.current !== activeOrder.id) {
      addToast('🎉 Вас выбрали исполнителем по заявке! Клиент ожидает выезда', '🚀');
    }
    prevActiveOrderIdRef.current = activeOrder?.id || null;
  }, [activeOrder, addToast]);

  // Master Location
  const masterCoords: MapCoords = availability?.location || { lat: 51.135, lng: 71.428 };
  const isOnline = availability?.isOnline ?? true;

  // Toggle Shift Status Action
  const handleToggleOnline = async () => {
    try {
      await toggleOnline(!isOnline);
      addToast(
        !isOnline ? '🟢 Вы вышли на смену! Радар заявок активен' : '⚪ Вы ушли на перерыв. Заявки приостановлены',
        !isOnline ? '🟢' : '⚪'
      );
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Ошибка смены статуса', '❌');
    }
  };

  // Open Bidding Modal for a Request
  const handleOpenBidding = (req: NearbyRequestItem) => {
    setBiddingRequest(req);
    if (req.category === 'battery_jumpstart') {
      setPriceKzt(5000);
      setOfferMessage('Выезжаю с профессиональным пусковым бустером 12V/24V.');
    } else if (req.category === 'electrical_starting') {
      setPriceKzt(7000);
      setOfferMessage('С собой сканер Launch, мультиметр и инструмент для стартера.');
    } else {
      setPriceKzt(6000);
      setOfferMessage('Мобильный механик. Инструмент и домкрат в наличии.');
    }
    setEtaMinutes(15);
  };

  // Submit Bid Action
  const handleSendOfferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!biddingRequest) return;

    setIsSendingOffer(true);
    try {
      await sendOffer({
        requestId: biddingRequest.id,
        pricingMode,
        amountKzt: priceKzt,
        minKzt: minPriceKzt,
        maxKzt: maxPriceKzt,
        etaMinutes,
        message: offerMessage,
      });

      setBiddingRequest(null);
      addToast(`Предложение на ${priceKzt.toLocaleString('ru-RU')} ₸ успешно отправлено клиенту!`, '✓');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Ошибка отправки оффера', '❌');
    } finally {
      setIsSendingOffer(false);
    }
  };

  // Status Machine Transitions Action (Phase 3)
  const handleTransitionStatus = async (nextStatus: string) => {
    if (!activeOrder) return;
    setIsUpdatingStatus(true);
    try {
      await updateOrderStatus(
        activeOrder.id,
        nextStatus,
        nextStatus === 'COMPLETED' ? finalPriceKzt || (activeOrder.agreedAmountTiyn ? activeOrder.agreedAmountTiyn / 100 : 5000) : undefined
      );

      if (nextStatus === 'EN_ROUTE') addToast('🚗 Статус: Вы выехали к клиенту!', '🚗');
      if (nextStatus === 'ARRIVED') addToast('📍 Статус: Вы прибыли на место встречи!', '📍');
      if (nextStatus === 'IN_PROGRESS') addToast('🔧 Статус: Ремонтные работы начаты!', '🔧');
      if (nextStatus === 'COMPLETED') {
        addToast('🎉 Заказ успешно завершен! Чек сформирован', '✓');
        setReviewSubmitted(false);
      }
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Ошибка смены статуса', '❌');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Cancel Order Action
  const handleCancelOrderSubmit = async () => {
    if (!activeOrder) return;
    setIsUpdatingStatus(true);
    try {
      await updateOrderStatus(activeOrder.id, 'CANCELLED', undefined, cancelReason);
      setShowCancelModal(false);
      addToast('Заказ отменен', '⚠️');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Ошибка отмены', '❌');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Mutual Review Submission (Phase 4)
  const handleSubmitMutualReview = async () => {
    if (!activeOrder) return;
    setIsSubmittingReview(true);
    try {
      await submitReview(activeOrder.id, reviewRating, reviewTag);
      setReviewSubmitted(true);
      addToast('Спасибо! Взаимный отзыв клиенту отправлен', '⭐');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Ошибка отзыва', '❌');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Customer Phone Link
  const clientPhone = activeOrder?.customer.phone || '+77011112233';
  const cleanClientPhone = clientPhone.replace(/\D/g, '');
  const clientLat = activeOrder?.request.location.lat || 51.1283;
  const clientLng = activeOrder?.request.location.lng || 71.4305;

  // Map Provider & Request Pins
  const mapPins: ProviderPin[] = [
    {
      id: providerId,
      name: `Вы: ${profile?.businessName || 'Мастер'}`,
      type: isOnline ? '🟢 На смене' : '⚪ На перерыве',
      lat: masterCoords.lat,
      lng: masterCoords.lng,
      rating: profile?.rating || 490,
    },
    ...nearbyRequests.map((r, idx) => ({
      id: r.id,
      name: `Заявка #${idx + 1}: ${r.category}`,
      type: `${r.distanceKm} км от вас`,
      lat: r.location.lat,
      lng: r.location.lng,
      rating: 500,
    })),
  ];

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

      {/* 0. MASTER TOP BAR & SHIFT CONTROLS (Phase 1) */}
      <div
        className="glass-card"
        style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid var(--border-accent)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: isOnline ? 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)' : 'rgba(100, 116, 139, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
              boxShadow: isOnline ? '0 0 15px rgba(16, 185, 129, 0.4)' : 'none',
            }}
          >
            👨‍🔧
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <select
                className="form-select"
                value={providerId}
                onChange={(e) => switchProvider(e.target.value)}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', fontWeight: 700, width: 'auto' }}
              >
                {DEMO_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type})
                  </option>
                ))}
              </select>
              <span className="badge badge-emerald" style={{ fontSize: '0.65rem' }}>
                ⭐ {((profile?.rating || 490) / 100).toFixed(1)}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Радиус выезда: {availability?.radiusKm || 12} км • Астана
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Shift Revenue Badge */}
          <button
            onClick={() => setShowStatsModal(true)}
            className="btn btn-secondary"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            💰 <span>{(shiftStats?.todayGmvTiyn ? shiftStats.todayGmvTiyn / 100 : 0).toLocaleString('ru-RU')} ₸</span>
            <span style={{ color: 'var(--text-muted)' }}>({shiftStats?.todayOrdersCount || 0} выездов)</span>
          </button>

          {/* Online Toggle Button */}
          <button
            onClick={handleToggleOnline}
            className={isOnline ? 'btn btn-emerald' : 'btn btn-secondary'}
            style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', fontWeight: 700 }}
          >
            {isOnline ? '🟢 На смене' : '⚪ На перерыве'}
          </button>
        </div>
      </div>

      {/* 1. ACTIVE ORDER EXECUTION VIEW (Phase 3) */}
      {activeOrder ? (
        <div className="glass-card" style={{ padding: '2rem', border: '2px solid var(--emerald)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <span className="badge badge-emerald" style={{ marginBottom: '0.5rem' }}>
                ⚡ Активный заказ в исполнении
              </span>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem' }}>
                {activeOrder.status === 'PROVIDER_SELECTED' && '✓ Клиент выбрал вас! Готовьтесь к выезду'}
                {activeOrder.status === 'EN_ROUTE' && '🚗 Вы в пути к клиенту'}
                {activeOrder.status === 'ARRIVED' && '📍 Вы прибыли на место встречи'}
                {activeOrder.status === 'IN_PROGRESS' && '🔧 Выполняются ремонтные работы'}
                {activeOrder.status === 'COMPLETED' && '🎉 Заказ успешно завершен!'}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Категория: <span style={{ color: '#f8fafc', fontWeight: 600 }}>{activeOrder.request.category}</span>
                {activeOrder.request.description ? ` • ${activeOrder.request.description}` : ''}
              </p>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Согласованная цена</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--emerald)' }}>
                {activeOrder.finalAmountTiyn
                  ? `${(activeOrder.finalAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                  : activeOrder.agreedAmountTiyn
                  ? `${(activeOrder.agreedAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                  : 'По прайсу'}
              </div>
            </div>
          </div>

          {/* CLIENT CONTACTS & NAVIGATION BAR (Phase 3) */}
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
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(59, 130, 246, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                }}
              >
                🚗
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem' }}>Клиент: {clientPhone}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  Точка встречи: {clientLat.toFixed(4)}, {clientLng.toFixed(4)}
                </div>
              </div>
            </div>

            {/* Direct Communication & GPS Navigation Links */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <a
                href={`tel:${cleanClientPhone}`}
                className="btn btn-emerald"
                style={{ textDecoration: 'none', padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
              >
                📞 Позвонить
              </a>
              <a
                href={`https://wa.me/${cleanClientPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ textDecoration: 'none', padding: '0.5rem 0.9rem', fontSize: '0.85rem', borderColor: '#25D366', color: '#25D366' }}
              >
                💬 WhatsApp
              </a>
              <a
                href={`https://2gis.kz/astana/geo/${clientLng}%2C${clientLat}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ textDecoration: 'none', padding: '0.5rem 0.9rem', fontSize: '0.85rem', borderColor: 'var(--primary)', color: '#93c5fd' }}
              >
                🗺️ Навигатор (2GIS)
              </a>
            </div>
          </div>

          {/* ESCROW PAYMENT GUARANTEE BADGE */}
          <div
            style={{
              padding: '0.85rem 1rem',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(16, 185, 129, 0.12) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginTop: '1rem',
            }}
          >
            <span style={{ fontSize: '1.4rem' }}>🛡️</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#93c5fd' }}>
                Оплата заблокирована сервисом CarFix Escrow (100% гарантия)
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                Клиент внес средства на безопасный счет. Сумма за вычетом 12% сервиса будет мгновенно зачислена в ваш кошелек при завершении заказа.
              </div>
            </div>
          </div>

          {/* STEP-BY-STEP ACTION BUTTONS (Phase 3) */}
          <div style={{ marginTop: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Этапы выполнения заказа:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => handleTransitionStatus('EN_ROUTE')}
                disabled={isUpdatingStatus || activeOrder.status !== 'PROVIDER_SELECTED'}
                className={`btn ${activeOrder.status === 'EN_ROUTE' ? 'btn-emerald' : 'btn-secondary'}`}
                style={{ padding: '0.75rem' }}
              >
                🚗 1. Я выехал (В пути)
              </button>

              <button
                type="button"
                onClick={() => handleTransitionStatus('ARRIVED')}
                disabled={isUpdatingStatus || !['EN_ROUTE', 'PROVIDER_SELECTED'].includes(activeOrder.status)}
                className={`btn ${activeOrder.status === 'ARRIVED' ? 'btn-emerald' : 'btn-secondary'}`}
                style={{ padding: '0.75rem' }}
              >
                📍 2. Прибыл на место
              </button>

              <button
                type="button"
                onClick={() => handleTransitionStatus('IN_PROGRESS')}
                disabled={isUpdatingStatus || !['ARRIVED', 'EN_ROUTE'].includes(activeOrder.status)}
                className={`btn ${activeOrder.status === 'IN_PROGRESS' ? 'btn-emerald' : 'btn-secondary'}`}
                style={{ padding: '0.75rem' }}
              >
                🔧 3. Приступил к работе
              </button>

              <button
                type="button"
                onClick={() => handleTransitionStatus('COMPLETED')}
                disabled={isUpdatingStatus || !['IN_PROGRESS', 'ARRIVED'].includes(activeOrder.status)}
                className="btn btn-emerald"
                style={{ padding: '0.75rem', fontWeight: 800 }}
              >
                ✓ 4. Завершить заказ
              </button>
            </div>
          </div>

          {/* MUTUAL REVIEW FORM (Phase 4) */}
          {activeOrder.status === 'COMPLETED' && (
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                🌟 Оцените клиента для сообщества мастеров
              </h3>
              {reviewSubmitted ? (
                <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-sm)', color: '#6ee7b7', fontWeight: 600 }}>
                  ✓ Спасибо! Взаимный отзыв сохранен.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      Оценка клиента:
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
                          }}
                        >
                          ⭐ {star}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      Быстрый тег:
                    </label>
                    <select
                      className="form-select"
                      value={reviewTag}
                      onChange={(e) => setReviewTag(e.target.value)}
                    >
                      <option value="Вежливый и пунктуальный">Вежливый и пунктуальный</option>
                      <option value="Точный адрес и быстрый доступ">Точный адрес и быстрый доступ</option>
                      <option value="Быстрая и полная оплата">Быстрая и полная оплата</option>
                      <option value="Рекомендую другим мастерам">Рекомендую другим мастерам</option>
                    </select>
                  </div>

                  <button
                    onClick={handleSubmitMutualReview}
                    disabled={isSubmittingReview}
                    className="btn btn-emerald"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {isSubmittingReview ? 'Отправка...' : 'Отправить оценку клиенту'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CANCEL MODAL TRIGGER */}
          {activeOrder.status !== 'COMPLETED' && (
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCancelModal(true)}
                className="btn btn-secondary"
                style={{ borderColor: '#ef4444', color: '#f87171', fontSize: '0.8rem' }}
              >
                ✕ Отменить заказ (Аварийно)
              </button>
            </div>
          )}
        </div>
      ) : (
        /* 2. LIVE RADAR OF NEARBY REQUESTS (Phase 2 & 5) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* MAP & GPS VIEW */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                  🗺️ Карта заказов в Астане
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Синий маркер — ваша геопозиция. Точки — открытые заявки автомобилистов.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fetchNearbyRequests()}
                disabled={isRefreshingRequests}
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
              >
                {isRefreshingRequests ? 'Обновление...' : '🔄 Обновить радар'}
              </button>
            </div>

            <AstanaMap
              center={masterCoords}
              radiusKm={availability?.radiusKm || 12}
              onLocationChange={(coords) => updateLocation(coords.lat, coords.lng)}
              providerPins={mapPins}
            />
          </div>

          {/* NEARBY REQUESTS FEED (Phase 2) */}
          <div className="glass-card" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="radar-scanner" style={{ width: '48px', height: '48px' }}>
                  <div className="radar-sweep-line" />
                  <div style={{ fontSize: '1.2rem', zIndex: 2 }}>📡</div>
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                    Доступные заявки поблизости
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {isOnline ? `Поиск в радиусе ${availability?.radiusKm || 12} км • Авто-обновление 3.5с` : 'Вы оффлайн'}
                  </div>
                </div>
              </div>

              <span className="badge badge-blue">
                {nearbyRequests.length} {nearbyRequests.length === 1 ? 'заявка' : 'заявок'}
              </span>
            </div>

            {!isOnline ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', background: 'rgba(15, 23, 42, 0.5)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏸️</div>
                <div style={{ fontWeight: 700 }}>Вы находитесь на перерыве</div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem', marginBottom: '1rem' }}>
                  Включите тумблер «На смене» вверху, чтобы получать заказы с карты Астаны
                </p>
                <button onClick={handleToggleOnline} className="btn btn-emerald">
                  🟢 Выйти на смену
                </button>
              </div>
            ) : nearbyRequests.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', background: 'rgba(15, 23, 42, 0.5)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📡</div>
                <div style={{ fontWeight: 700 }}>Ожидание новых заявок в вашем районе...</div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Переключитесь на вкладку «🚗 Автомобилист» и создайте заявку для теста
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {nearbyRequests.map((req) => (
                  <div
                    key={req.id}
                    className="glass-card"
                    style={{
                      padding: '1.25rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      border: req.myOffer ? '1px solid var(--primary)' : '1px solid var(--border-accent)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="badge badge-blue">
                          {req.category === 'battery_jumpstart' ? '🔋 Прикурка АКБ' : req.category === 'electrical_starting' ? '⚡ Автоэлектрика' : '🔧 Механик'}
                        </span>
                        <span className="badge badge-emerald">
                          📍 ~{req.distanceKm} км от вас
                        </span>
                        {req.myOffer && (
                          <span className="badge badge-amber">
                            ✓ Оффер отправлен ({(req.myOffer.amountTiyn ? req.myOffer.amountTiyn / 100 : 0).toLocaleString('ru-RU')} ₸)
                          </span>
                        )}
                      </div>

                      <h4 style={{ fontWeight: 800, fontSize: '1.05rem', marginTop: '0.35rem' }}>
                        {req.description || 'Требуется оперативная автопомощь на дороге'}
                      </h4>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Создана {new Date(req.createdAt).toLocaleTimeString('ru-RU')} • Координаты: {req.location.lat.toFixed(4)}, {req.location.lng.toFixed(4)}
                      </div>
                    </div>

                    <div>
                      {req.myOffer ? (
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.8rem', color: '#93c5fd' }}>
                            Ожидаем решения клиента...
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenBidding(req)}
                          className="btn btn-emerald"
                          style={{ padding: '0.65rem 1.25rem', fontWeight: 800 }}
                        >
                          ⚡ Откликнуться (Оффер)
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. OFFER BIDDING MODAL (Phase 2) */}
      {biddingRequest && (
        <div className="modal-overlay" onClick={() => setBiddingRequest(null)}>
          <div
            className="glass-card"
            style={{ maxWidth: '480px', width: '100%', padding: '2rem', background: '#0e131f' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.25rem' }}>
              ⚡ Отправка предложения клиенту
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Заявка: {biddingRequest.category} (~{biddingRequest.distanceKm} км от вас)
            </p>

            <form onSubmit={handleSendOfferSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Pricing Mode */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Тип цены:
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setPricingMode('fixed')}
                    className={`btn ${pricingMode === 'fixed' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                  >
                    Фиксированная
                  </button>
                  <button
                    type="button"
                    onClick={() => setPricingMode('diagnostic_fee')}
                    className={`btn ${pricingMode === 'diagnostic_fee' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                  >
                    Диагностика
                  </button>
                </div>
              </div>

              {/* Price Input & Quick Step Buttons */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Ваша стоимость (₸):
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={priceKzt}
                  onChange={(e) => setPriceKzt(Number(e.target.value))}
                  min={1000}
                  step={500}
                  required
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {[3000, 5000, 7000, 10000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPriceKzt(preset)}
                      className="chip"
                      style={{ flex: 1, textAlign: 'center' }}
                    >
                      {preset} ₸
                    </button>
                  ))}
                </div>
              </div>

              {/* ETA Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Расчетное время прибытия:
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[10, 15, 25, 40].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setEtaMinutes(mins)}
                      className={`btn ${etaMinutes === mins ? 'btn-emerald' : 'btn-secondary'}`}
                      style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                    >
                      {mins} мин
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment / Message */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Комментарий клиенту:
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                  placeholder="Оборудование с собой, готов к выезду..."
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  disabled={isSendingOffer}
                  className="btn btn-emerald"
                  style={{ flex: 1, fontWeight: 800 }}
                >
                  {isSendingOffer ? 'Отправка...' : 'Отправить предложение'}
                </button>
                <button
                  type="button"
                  onClick={() => setBiddingRequest(null)}
                  className="btn btn-secondary"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. CANCEL ORDER MODAL (Phase 3) */}
      {showCancelModal && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div
            className="glass-card"
            style={{ maxWidth: '420px', width: '100%', padding: '2rem', background: '#0e131f' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.25rem' }}>
              ⚠️ Аварийная отмена заказа
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Укажите причину отмены. Заказ будет закрыт, а клиент оповещен.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                type="text"
                className="form-input"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Причина отмены..."
              />

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleCancelOrderSubmit}
                  disabled={isUpdatingStatus}
                  className="btn btn-secondary"
                  style={{ flex: 1, borderColor: '#ef4444', color: '#f87171' }}
                >
                  {isUpdatingStatus ? 'Отмена...' : 'Подтвердить отмену'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="btn btn-secondary"
                >
                  Назад
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. SHIFT STATS & EARNINGS MODAL (Phase 4) */}
      {showStatsModal && (
        <div className="modal-overlay" onClick={() => setShowStatsModal(false)}>
          <div
            className="glass-card"
            style={{ maxWidth: '640px', width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: '2rem', background: '#0e131f' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                📊 Мой доход и история смен
              </h3>
              <button
                onClick={() => setShowStatsModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Metrics cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div style={{ padding: '0.85rem', background: 'rgba(15, 23, 42, 0.8)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Оборот (GMV)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#93c5fd' }}>
                  {(shiftStats?.totalGmvTiyn ? shiftStats.totalGmvTiyn / 100 : 0).toLocaleString('ru-RU')} ₸
                </div>
              </div>

              <div style={{ padding: '0.85rem', background: 'rgba(15, 23, 42, 0.8)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Сбор CarFix (12%)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#f87171' }}>
                  {(shiftStats?.totalGmvTiyn ? Math.round((shiftStats.totalGmvTiyn * 0.12) / 100) : 0).toLocaleString('ru-RU')} ₸
                </div>
              </div>

              <div style={{ padding: '0.85rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Чистый доход (88%)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--emerald)' }}>
                  {(shiftStats?.totalGmvTiyn ? Math.round((shiftStats.totalGmvTiyn * 0.88) / 100) : 0).toLocaleString('ru-RU')} ₸
                </div>
              </div>

              <div style={{ padding: '0.85rem', background: 'rgba(15, 23, 42, 0.8)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Выездов всего</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>
                  {shiftStats?.totalCompletedJobs || 0}
                </div>
              </div>
            </div>

            {/* Withdrawal Action Button */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowWithdrawModal(true)}
                className="btn btn-emerald"
                style={{ width: '100%', padding: '0.75rem', fontWeight: 800 }}
              >
                💳 Вывести на Kaspi Gold / Halyk Bank
              </button>
            </div>

            {/* List of completed orders */}
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              Завершенные заказы:
            </h4>

            {shiftStats?.orders.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Заказов пока не было.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {shiftStats?.orders.map((ord) => (
                  <div
                    key={ord.id}
                    style={{
                      padding: '0.85rem',
                      background: 'rgba(15, 23, 42, 0.8)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                        {ord.category} • {ord.customerPhone}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(ord.completedAt).toLocaleDateString('ru-RU')} • {ord.receivedReview ? `⭐ ${ord.receivedReview.rating}` : 'Без отзыва'}
                      </div>
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--emerald)' }}>
                      {(ord.finalAmountTiyn / 100).toLocaleString('ru-RU')} ₸
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. WITHDRAWAL MODAL (Stage 3 Fintech) */}
      {showWithdrawModal && (
        <div className="modal-overlay" onClick={() => setShowWithdrawModal(false)}>
          <div
            className="glass-card"
            style={{ maxWidth: '440px', width: '100%', padding: '2rem', background: '#0e131f' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.25rem' }}>
              💳 Вывод средств на карту
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Моментальный перевод через Kaspi Pay Gateway / Halyk Bank
            </p>

            <form onSubmit={handleWithdraw} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Банк назначения:
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setWithdrawDestinationType('KASPI_GOLD')}
                    className={`btn ${withdrawDestinationType === 'KASPI_GOLD' ? 'btn-emerald' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                  >
                    🟡 Kaspi Gold
                  </button>
                  <button
                    type="button"
                    onClick={() => setWithdrawDestinationType('HALYK_BANK')}
                    className={`btn ${withdrawDestinationType === 'HALYK_BANK' ? 'btn-emerald' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                  >
                    🟢 Halyk Bank
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Номер карты или телефон:
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={withdrawCardNumber}
                  onChange={(e) => setWithdrawCardNumber(e.target.value)}
                  placeholder="4400 4301 9988 1234 или +7 701..."
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Сумма вывода (₸):
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={withdrawAmountKzt}
                  onChange={(e) => setWithdrawAmountKzt(Number(e.target.value))}
                  min={1000}
                  step={500}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  disabled={isWithdrawing}
                  className="btn btn-emerald"
                  style={{ flex: 1, fontWeight: 800 }}
                >
                  {isWithdrawing ? 'Отправка...' : 'Подтвердить вывод'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className="btn btn-secondary"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
