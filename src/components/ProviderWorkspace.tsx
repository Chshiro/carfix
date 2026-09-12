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
  // 1. Master Session Hook
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

  // 2. Toasts System
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; icon?: string }>>([]);
  const addToast = useCallback((text: string, icon: string = '⚡') => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, text, icon }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // 3. Offer Bidding Modal State
  const [biddingRequest, setBiddingRequest] = useState<NearbyRequestItem | null>(null);
  const [pricingMode, setPricingMode] = useState<PricingMode>('fixed');
  const [priceKzt, setPriceKzt] = useState<number>(5000);
  const [minPriceKzt, setMinPriceKzt] = useState<number>(8000);
  const [maxPriceKzt, setMaxPriceKzt] = useState<number>(15000);
  const [etaMinutes, setEtaMinutes] = useState<number>(15);
  const [offerMessage, setOfferMessage] = useState<string>('Выезжаю сразу со всем необходимым инструментом.');
  const [isSendingOffer, setIsSendingOffer] = useState<boolean>(false);

  // 4. Order Execution Actions State
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [finalPriceKzt, setFinalPriceKzt] = useState<number>(5000);
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('Клиент перестал отвечать на звонки');

  // 5. Mutual Review State
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewTag, setReviewTag] = useState<string>('Вежливый и пунктуальный');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [reviewSubmitted, setReviewSubmitted] = useState<boolean>(false);

  // 6. Stats & History Modal
  const [showStatsModal, setShowStatsModal] = useState<boolean>(false);

  // 7. Withdrawal Modal State
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

  // Track order assignment transition
  const prevActiveOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeOrder?.id && prevActiveOrderIdRef.current !== activeOrder.id) {
      addToast('🎉 Вас выбрали исполнителем по заявке! Клиент ожидает выезда', '🚀');
    }
    prevActiveOrderIdRef.current = activeOrder?.id || null;
  }, [activeOrder, addToast]);

  // Master Location & Shift Status
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

  // Status Machine Transitions Action
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

  // Mutual Review Submission
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

  // Customer Contact & Location
  const clientPhone = activeOrder?.customer.phone || '+77011112233';
  const cleanClientPhone = clientPhone.replace(/\D/g, '');
  const clientLat = activeOrder?.request.location.lat || 51.1283;
  const clientLng = activeOrder?.request.location.lng || 71.4305;

  // Map Pins
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

      {/* 0. TACTILE SHIFT CONTROL & TOP PROFILE BAR */}
      <div className={`shift-toggle-card ${isOnline ? 'online' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: isOnline ? 'linear-gradient(135deg, #06B6D4 0%, #2563EB 100%)' : '#192642',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.8rem',
              boxShadow: isOnline ? '0 0 20px var(--aquamarine-glow)' : 'none',
              transition: 'all 0.25s ease',
            }}
          >
            👨‍🔧
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <select
                className="form-select"
                value={providerId}
                onChange={(e) => switchProvider(e.target.value)}
                style={{ padding: '0.4rem 0.75rem', fontSize: '1rem', fontWeight: 800, width: 'auto', background: '#0D1627' }}
              >
                {DEMO_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type})
                  </option>
                ))}
              </select>
              <span className="badge badge-aquamarine" style={{ fontSize: '0.8rem' }}>
                ⭐ {((profile?.rating || 490) / 100).toFixed(1)}
              </span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Радиус выезда: {availability?.radiusKm || 12} км &bull; Астана
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Shift Revenue Badge */}
          <button
            onClick={() => setShowStatsModal(true)}
            className="btn btn-secondary"
            style={{ padding: '0.65rem 1.25rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            💰 <span style={{ fontWeight: 800, color: 'var(--aquamarine-bright)' }}>{(shiftStats?.todayGmvTiyn ? shiftStats.todayGmvTiyn / 100 : 0).toLocaleString('ru-RU')} ₸</span>
            <span style={{ color: 'var(--text-muted)' }}>({shiftStats?.todayOrdersCount || 0} выездов)</span>
          </button>

          {/* Big Tactile Shift Toggle Switch */}
          <button
            onClick={handleToggleOnline}
            className={`shift-toggle-btn ${isOnline ? 'online' : 'offline'}`}
          >
            {isOnline ? '🟢 Я свободен, готов к выездам' : '⚪ На перерыве'}
          </button>
        </div>
      </div>

      {/* 1. ACTIVE ORDER EXECUTION VIEW */}
      {activeOrder ? (
        <div className="glass-card" style={{ padding: '2.25rem', border: '2px solid var(--aquamarine)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem' }}>
            <div>
              <span className="badge badge-aquamarine" style={{ marginBottom: '0.65rem' }}>
                ⚡ Активный заказ в исполнении
              </span>
              <h2 style={{ fontSize: '1.65rem', fontWeight: 900, marginTop: '0.35rem', color: '#FFFFFF' }}>
                {activeOrder.status === 'PROVIDER_SELECTED' && '✓ Клиент выбрал вас! Готовьтесь к выезду'}
                {activeOrder.status === 'EN_ROUTE' && '🚗 Вы в пути к автомобилю клиента'}
                {activeOrder.status === 'ARRIVED' && '📍 Вы прибыли на место встречи'}
                {activeOrder.status === 'IN_PROGRESS' && '🔧 Выполняются ремонтные работы'}
                {activeOrder.status === 'COMPLETED' && '🎉 Заказ успешно завершен!'}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginTop: '0.35rem' }}>
                Категория: <span style={{ color: '#FFFFFF', fontWeight: 800 }}>{activeOrder.request.category}</span>
                {activeOrder.request.description ? ` &bull; ${activeOrder.request.description}` : ''}
              </p>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Согласованная стоимость</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--aquamarine-bright)' }}>
                {activeOrder.finalAmountTiyn
                  ? `${(activeOrder.finalAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                  : activeOrder.agreedAmountTiyn
                  ? `${(activeOrder.agreedAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                  : 'По согласованию'}
              </div>
            </div>
          </div>

          {/* CLIENT CONTACTS & DIRECT NAVIGATION BAR */}
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
              gap: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: 'rgba(37, 99, 235, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.8rem',
                }}
              >
                🚗
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.2rem', color: '#FFFFFF' }}>
                  Клиент: {clientPhone}
                </div>
                <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Точка встречи: {clientLat.toFixed(4)}, {clientLng.toFixed(4)}
                </div>
              </div>
            </div>

            {/* Direct Communication & GPS Navigation (2GIS / Yandex) */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <a
                href={`tel:${cleanClientPhone}`}
                className="btn-touch-action btn-aquamarine"
                style={{ minHeight: '50px', padding: '0.65rem 1.25rem', fontSize: '0.95rem' }}
              >
                📞 Позвонить
              </a>
              <a
                href={`https://wa.me/${cleanClientPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-touch-action btn-secondary"
                style={{ minHeight: '50px', padding: '0.65rem 1.25rem', fontSize: '0.95rem', borderColor: '#25D366', color: '#25D366' }}
              >
                💬 WhatsApp
              </a>
              <a
                href={`https://2gis.kz/astana/geo/${clientLng}%2C${clientLat}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-touch-action btn-primary"
                style={{ minHeight: '50px', padding: '0.65rem 1.35rem', fontSize: '0.95rem' }}
              >
                🗺️ Маршрут в 2GIS / Яндекс
              </a>
            </div>
          </div>

          {/* ESCROW PAYMENT GUARANTEE BADGE */}
          <div
            style={{
              padding: '1.1rem 1.35rem',
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.18) 0%, rgba(6, 182, 212, 0.15) 100%)',
              border: '1px solid var(--aquamarine)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginTop: '1.25rem',
            }}
          >
            <span style={{ fontSize: '1.8rem' }}>🛡️</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#FFFFFF' }}>
                Оплата заблокирована сервисом CarFix Escrow (100% гарантия выплаты)
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Клиент уже внес средства. 88% от суммы будут мгновенно зачислены на ваш баланс сразу после завершения заказа.
              </div>
            </div>
          </div>

          {/* STEP-BY-STEP ACTION BUTTONS */}
          <div style={{ marginTop: '1.75rem' }}>
            <label style={{ display: 'block', fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem', color: '#FFFFFF' }}>
              Этапы выполнения заказа:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
              <button
                type="button"
                onClick={() => handleTransitionStatus('EN_ROUTE')}
                disabled={isUpdatingStatus || activeOrder.status !== 'PROVIDER_SELECTED'}
                className={`btn ${activeOrder.status === 'EN_ROUTE' ? 'btn-aquamarine' : 'btn-secondary'}`}
                style={{ padding: '0.95rem', fontSize: '1rem' }}
              >
                🚗 1. Я выехал (В пути)
              </button>

              <button
                type="button"
                onClick={() => handleTransitionStatus('ARRIVED')}
                disabled={isUpdatingStatus || !['EN_ROUTE', 'PROVIDER_SELECTED'].includes(activeOrder.status)}
                className={`btn ${activeOrder.status === 'ARRIVED' ? 'btn-aquamarine' : 'btn-secondary'}`}
                style={{ padding: '0.95rem', fontSize: '1rem' }}
              >
                📍 2. Прибыл на место
              </button>

              <button
                type="button"
                onClick={() => handleTransitionStatus('IN_PROGRESS')}
                disabled={isUpdatingStatus || !['ARRIVED', 'EN_ROUTE'].includes(activeOrder.status)}
                className={`btn ${activeOrder.status === 'IN_PROGRESS' ? 'btn-aquamarine' : 'btn-secondary'}`}
                style={{ padding: '0.95rem', fontSize: '1rem' }}
              >
                🔧 3. Приступил к работе
              </button>

              <button
                type="button"
                onClick={() => handleTransitionStatus('COMPLETED')}
                disabled={isUpdatingStatus || !['IN_PROGRESS', 'ARRIVED'].includes(activeOrder.status)}
                className="btn btn-aquamarine"
                style={{ padding: '0.95rem', fontWeight: 900, fontSize: '1rem' }}
              >
                ✓ 4. Завершить заказ
              </button>
            </div>
          </div>

          {/* MUTUAL REVIEW FORM */}
          {activeOrder.status === 'COMPLETED' && (
            <div style={{ marginTop: '2rem', padding: '1.75rem', background: 'rgba(6, 182, 212, 0.08)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--aquamarine)' }}>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 900, marginBottom: '0.65rem' }}>
                🌟 Оцените водителя для сообщества мастеров
              </h3>
              {reviewSubmitted ? (
                <div style={{ padding: '1.15rem', background: 'rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-md)', color: '#A7F3D0', fontWeight: 700 }}>
                  ✓ Спасибо! Взаимный отзыв клиенту отправлен.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                      Оценка клиента:
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
                    className="btn btn-aquamarine"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {isSubmittingReview ? 'Отправка...' : 'Отправить отзыв клиенту'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CANCEL MODAL TRIGGER */}
          {activeOrder.status !== 'COMPLETED' && (
            <div style={{ marginTop: '1.75rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCancelModal(true)}
                className="btn btn-secondary"
                style={{ borderColor: '#F43F5E', color: '#FDA4AF', fontSize: '0.9rem' }}
              >
                ✕ Отменить заказ (Аварийно)
              </button>
            </div>
          )}
        </div>
      ) : (
        /* 2. LIVE RADAR OF NEARBY REQUESTS */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* MAP & GPS VIEW */}
          <div className="glass-card" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#FFFFFF' }}>
                  🗺️ Карта заказов в Астане
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Синий маркер — ваша локация. Точки — открытые заявки автомобилистов.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fetchNearbyRequests()}
                disabled={isRefreshingRequests}
                className="btn btn-secondary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
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

          {/* NEARBY REQUESTS FEED */}
          <div className="glass-card" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="caring-radar" style={{ width: '60px', height: '60px' }}>
                  <div className="caring-radar-circle" />
                  <div className="caring-radar-core" style={{ width: '36px', height: '36px', fontSize: '1.1rem' }}>📡</div>
                </div>
                <div>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#FFFFFF' }}>
                    Доступные заявки поблизости
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {isOnline ? `Радиус поиска: ${availability?.radiusKm || 12} км &bull; Авто-обновление 3.5с` : 'Вы находитесь оффлайн'}
                  </div>
                </div>
              </div>

              <span className="badge badge-aquamarine">
                {nearbyRequests.length} {nearbyRequests.length === 1 ? 'заявка' : 'заявок'}
              </span>
            </div>

            {!isOnline ? (
              <div style={{ padding: '3rem', textAlign: 'center', background: '#111C33', borderRadius: 'var(--radius-lg)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.65rem' }}>⏸️</div>
                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#FFFFFF' }}>Вы находитесь на перерыве</div>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginTop: '0.35rem', marginBottom: '1.25rem' }}>
                  Нажмите кнопку «Я свободен» вверху экрана, чтобы принимать вызовы с карты Астаны
                </p>
                <button onClick={handleToggleOnline} className="btn btn-aquamarine">
                  🟢 Выйти на смену
                </button>
              </div>
            ) : nearbyRequests.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', background: '#111C33', borderRadius: 'var(--radius-lg)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.65rem' }}>📡</div>
                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#FFFFFF' }}>Ожидание новых заявок в вашем районе...</div>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  Переключитесь на вкладку «🚗 Автомобилист» вверху экрана и создайте тестовую заявку
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                {nearbyRequests.map((req) => (
                  <div
                    key={req.id}
                    className="glass-card"
                    style={{
                      padding: '1.5rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '1.25rem',
                      border: req.myOffer ? '2px solid var(--primary)' : '1px solid var(--border-card)',
                      background: '#111C33',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                        <span className="badge badge-blue">
                          {req.category === 'battery_jumpstart' ? '🔋 Прикурка АКБ' : req.category === 'electrical_starting' ? '⚡ Автоэлектрика' : '🔧 Механик'}
                        </span>
                        <span className="badge badge-aquamarine">
                          📍 ~{req.distanceKm} км от вас (~5-10 мин)
                        </span>
                        {req.myOffer && (
                          <span className="badge badge-amber">
                            ✓ Оффер отправлен ({(req.myOffer.amountTiyn ? req.myOffer.amountTiyn / 100 : 0).toLocaleString('ru-RU')} ₸)
                          </span>
                        )}
                      </div>

                      <h4 style={{ fontWeight: 900, fontSize: '1.15rem', marginTop: '0.5rem', color: '#FFFFFF' }}>
                        {req.description || 'Требуется оперативная автопомощь на дороге'}
                      </h4>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Создана {new Date(req.createdAt).toLocaleTimeString('ru-RU')} &bull; Координаты: {req.location.lat.toFixed(4)}, {req.location.lng.toFixed(4)}
                      </div>
                    </div>

                    <div>
                      {req.myOffer ? (
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.9rem', color: '#93C5FD', fontWeight: 700 }}>
                            Ожидаем решения клиента...
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenBidding(req)}
                          className="btn btn-aquamarine"
                          style={{ padding: '0.85rem 1.6rem', fontWeight: 900 }}
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

      {/* 3. OFFER BIDDING MODAL */}
      {biddingRequest && (
        <div className="modal-overlay" onClick={() => setBiddingRequest(null)}>
          <div
            className="glass-card"
            style={{ maxWidth: '480px', width: '100%', padding: '2.25rem', background: '#0D1627' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.45rem', fontWeight: 900, marginBottom: '0.35rem', color: '#FFFFFF' }}>
              ⚡ Отправить предложение клиенту
            </h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Заявка: {biddingRequest.category} &bull; ~{biddingRequest.distanceKm} км от вас
            </p>

            <form onSubmit={handleSendOfferSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Pricing Mode */}
              <div>
                <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', color: '#FFFFFF' }}>
                  Тип цены:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <button
                    type="button"
                    onClick={() => setPricingMode('fixed')}
                    className={`btn ${pricingMode === 'fixed' ? 'btn-aquamarine' : 'btn-secondary'}`}
                    style={{ padding: '0.65rem', fontSize: '0.9rem' }}
                  >
                    Фиксированная
                  </button>
                  <button
                    type="button"
                    onClick={() => setPricingMode('diagnostic_fee')}
                    className={`btn ${pricingMode === 'diagnostic_fee' ? 'btn-aquamarine' : 'btn-secondary'}`}
                    style={{ padding: '0.65rem', fontSize: '0.9rem' }}
                  >
                    Диагностика
                  </button>
                </div>
              </div>

              {/* Price & ETA Inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.4rem', color: '#FFFFFF' }}>
                    Сумма (₸):
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
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.4rem', color: '#FFFFFF' }}>
                    Время прибытия (мин):
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    value={etaMinutes}
                    onChange={(e) => setEtaMinutes(Number(e.target.value))}
                    min={5}
                    max={120}
                    required
                  />
                </div>
              </div>

              {/* Message to Customer */}
              <div>
                <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.4rem', color: '#FFFFFF' }}>
                  Сообщение клиенту:
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                  placeholder="Опишите готовность и инструмент..."
                />
              </div>

              <div style={{ display: 'flex', gap: '0.85rem', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  disabled={isSendingOffer}
                  className="btn btn-aquamarine"
                  style={{ flex: 1, padding: '0.95rem', fontWeight: 900 }}
                >
                  {isSendingOffer ? 'Отправка...' : 'Отправить отклик'}
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

      {/* 4. CANCEL ORDER MODAL */}
      {showCancelModal && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div
            className="glass-card"
            style={{ maxWidth: '440px', width: '100%', padding: '2.25rem', background: '#0D1627' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.35rem', fontWeight: 900, marginBottom: '0.35rem', color: '#FDA4AF' }}>
              ✕ Аварийная отмена заказа
            </h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Укажите причину отмены. Частые необоснованные отмены снижают рейтинг в системе.
            </p>

            <input
              type="text"
              className="form-input"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Причина отмены..."
              style={{ marginBottom: '1.25rem' }}
            />

            <div style={{ display: 'flex', gap: '0.85rem' }}>
              <button
                type="button"
                onClick={handleCancelOrderSubmit}
                disabled={isUpdatingStatus}
                className="btn btn-primary"
                style={{ flex: 1, background: '#F43F5E', borderColor: '#F43F5E', fontWeight: 900 }}
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
      )}

      {/* 5. SHIFT STATS & WITHDRAWAL MODAL */}
      {showStatsModal && (
        <div className="modal-overlay" onClick={() => setShowStatsModal(false)}>
          <div
            className="glass-card"
            style={{ maxWidth: '520px', width: '100%', padding: '2.25rem', background: '#0D1627' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.45rem', fontWeight: 900, color: '#FFFFFF' }}>
                💰 Кошелек & Статистика смены
              </h3>
              <button
                onClick={() => setShowStatsModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.6rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Wallet Balance Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ padding: '1.25rem', background: '#111C33', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-card)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Выручка за сегодня</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--aquamarine-bright)', marginTop: '0.35rem' }}>
                  {(shiftStats?.todayGmvTiyn ? shiftStats.todayGmvTiyn / 100 : 0).toLocaleString('ru-RU')} ₸
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  {shiftStats?.todayOrdersCount || 0} завершенных выездов
                </div>
              </div>

              <div style={{ padding: '1.25rem', background: '#111C33', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-card)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Баланс к выводу (88%)</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#10B981', marginTop: '0.35rem' }}>
                  {Math.round(((shiftStats?.todayGmvTiyn ? shiftStats.todayGmvTiyn * 0.88 : 0) / 100)).toLocaleString('ru-RU')} ₸
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Сервисный сбор 12% учтен
                </div>
              </div>
            </div>

            {/* Withdrawal Trigger Button */}
            <button
              onClick={() => {
                setShowStatsModal(false);
                setShowWithdrawModal(true);
              }}
              className="btn btn-aquamarine"
              style={{ width: '100%', padding: '1rem', fontWeight: 900, fontSize: '1.1rem' }}
            >
              💳 Вывести на Kaspi Gold / Halyk
            </button>
          </div>
        </div>
      )}

      {/* 6. WITHDRAWAL FORM MODAL */}
      {showWithdrawModal && (
        <div className="modal-overlay" onClick={() => setShowWithdrawModal(false)}>
          <div
            className="glass-card"
            style={{ maxWidth: '460px', width: '100%', padding: '2.25rem', background: '#0D1627' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.45rem', fontWeight: 900, marginBottom: '0.35rem', color: '#FFFFFF' }}>
              💳 Моментальный вывод средств
            </h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Вывод баланса мастера на банковские карты Казахстана без дополнительных комиссий.
            </p>

            <form onSubmit={handleWithdraw} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', color: '#FFFFFF' }}>
                  Банк назначения:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <button
                    type="button"
                    onClick={() => setWithdrawDestinationType('KASPI_GOLD')}
                    className={`btn ${withdrawDestinationType === 'KASPI_GOLD' ? 'btn-aquamarine' : 'btn-secondary'}`}
                    style={{ padding: '0.75rem', fontSize: '0.9rem' }}
                  >
                    🟡 Kaspi Gold
                  </button>
                  <button
                    type="button"
                    onClick={() => setWithdrawDestinationType('HALYK_BANK')}
                    className={`btn ${withdrawDestinationType === 'HALYK_BANK' ? 'btn-aquamarine' : 'btn-secondary'}`}
                    style={{ padding: '0.75rem', fontSize: '0.9rem' }}
                  >
                    🟢 Halyk Bank
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.4rem', color: '#FFFFFF' }}>
                  Номер карты / телефона:
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={withdrawCardNumber}
                  onChange={(e) => setWithdrawCardNumber(e.target.value)}
                  placeholder="4400 0000 0000 0000"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.4rem', color: '#FFFFFF' }}>
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

              <div style={{ display: 'flex', gap: '0.85rem', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  disabled={isWithdrawing}
                  className="btn btn-aquamarine"
                  style={{ flex: 1, padding: '0.95rem', fontWeight: 900 }}
                >
                  {isWithdrawing ? 'Вывод...' : 'Перевести на карту'}
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
