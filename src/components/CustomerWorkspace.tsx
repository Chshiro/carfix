'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AstanaMap, { ASTANA_LANDMARKS, MapCoords, ProviderPin } from './AstanaMap';

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
  };
  offer: {
    id: string;
    pricingMode: PricingMode;
    amountTiyn: number | null;
    minAmountTiyn: number | null;
    maxAmountTiyn: number | null;
    etaMinutes: number;
  };
}

interface CustomerWorkspaceProps {
  token: string | null;
  createdRequestId: string | null;
  setCreatedRequestId: (id: string | null) => void;
  selectedOrderResult: OrderResult | null;
  setSelectedOrderResult: (res: OrderResult | null | ((prev: OrderResult | null) => OrderResult | null)) => void;
  onlineProviders: ProviderPin[];
}

export default function CustomerWorkspace({
  token,
  createdRequestId,
  setCreatedRequestId,
  selectedOrderResult,
  setSelectedOrderResult,
  onlineProviders,
}: CustomerWorkspaceProps) {
  const [category, setCategory] = useState<ServiceCategory>('electrical_starting');
  const [coords, setCoords] = useState<MapCoords>({ lat: 51.1283, lng: 71.4305 });
  const [locationName, setLocationName] = useState<string>('Монумент Байтерек (Левый берег)');
  const [description, setDescription] = useState<string>('');
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [matchedCount, setMatchedCount] = useState<number | null>(null);
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [selectingOfferId, setSelectingOfferId] = useState<string | null>(null);

  // Review & Rating State
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('Отличная работа, мастер приехал вовремя!');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [reviewSubmitted, setReviewSubmitted] = useState<boolean>(false);

  // Cancel Modal State
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('Машина завелась сама');

  // Geolocation Handler
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('Геолокация не поддерживается вашим браузером');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(newCoords);
        setLocationName(`Текущая геопозиция: ${newCoords.lat.toFixed(4)}, ${newCoords.lng.toFixed(4)}`);
        setIsLocating(false);
      },
      (err) => {
        alert(`Не удалось определить геопозицию (${err.message}). Используем Астану.`);
        setIsLocating(false);
      }
    );
  };

  // Create Service Request
  const handleCreateRequest = async () => {
    if (!token) {
      alert('Авторизация в демо-режиме не готова');
      return;
    }
    setIsPublishing(true);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category,
          location: coords,
          description: description ? description.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setCreatedRequestId(data.data.requestId);
        setMatchedCount(data.data.matchedProvidersCount);
        setOffers([]);
        setSelectedOrderResult(null);
        setReviewSubmitted(false);
      } else {
        alert(`Ошибка создания заявки: ${data.error?.message || 'Неизвестная ошибка'}`);
      }
    } catch (e: unknown) {
      alert(`Сбой сети: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsPublishing(false);
    }
  };

  // Poll Offers for Created Request
  const fetchOffers = useCallback(async () => {
    if (!createdRequestId || !token || selectedOrderResult) return;
    try {
      const res = await fetch(`/api/requests/${createdRequestId}/offers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setOffers(data.data);
      }
    } catch (e) {
      console.error('Error fetching offers:', e);
    }
  }, [createdRequestId, token, selectedOrderResult]);

  useEffect(() => {
    if (!createdRequestId || selectedOrderResult) return;
    fetchOffers();
    const interval = setInterval(fetchOffers, 3000);
    return () => clearInterval(interval);
  }, [createdRequestId, selectedOrderResult, fetchOffers]);

  // Poll Latest Order Status when Order exists
  const selectedOrderId = selectedOrderResult?.order.id;

  useEffect(() => {
    if (!selectedOrderId || !token) return;

    const pollOrder = async () => {
      try {
        const res = await fetch(`/api/orders/${selectedOrderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok' && data.data?.order) {
          setSelectedOrderResult((prev) =>
            prev
              ? {
                  ...prev,
                  order: {
                    ...prev.order,
                    status: data.data.order.status,
                    finalAmountTiyn: data.data.order.finalAmountTiyn,
                    cancellationReason: data.data.order.cancellationReason,
                  },
                }
              : null
          );
        }
      } catch (e) {
        console.error('Error polling order:', e);
      }
    };

    pollOrder();
    const interval = setInterval(pollOrder, 2500);
    return () => clearInterval(interval);
  }, [selectedOrderId, token, setSelectedOrderResult]);

  // Select Master Offer
  const handleSelectOffer = async (offerId: string) => {
    if (!createdRequestId || !token) return;
    setSelectingOfferId(offerId);
    try {
      const res = await fetch(`/api/requests/${createdRequestId}/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ offerId }),
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setSelectedOrderResult(data.data as OrderResult);
      } else {
        alert(`Ошибка выбора мастера: ${data.error?.message || 'Сбой'}`);
      }
    } catch (e: unknown) {
      alert(`Сбой сети: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setSelectingOfferId(null);
    }
  };

  // Submit Review for Completed Order
  const handleSubmitReview = async () => {
    if (!selectedOrderResult || !token) return;
    setIsSubmittingReview(true);
    try {
      const res = await fetch(`/api/orders/${selectedOrderResult.order.id}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rating: reviewRating,
          comment: reviewComment ? reviewComment.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setReviewSubmitted(true);
      } else {
        alert(`Ошибка отправки отзыва: ${data.error?.message || 'Сбой'}`);
      }
    } catch (e: unknown) {
      alert(`Сбой сети: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Cancel Order
  const handleCancelOrder = async () => {
    if (!selectedOrderResult || !token) return;
    if (!cancelReason.trim()) {
      alert('Укажите причину отмены');
      return;
    }
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/orders/${selectedOrderResult.order.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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
      } else {
        alert(`Ошибка отмены заказа: ${data.error?.message || 'Сбой'}`);
      }
    } catch (e: unknown) {
      alert(`Сбой сети: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsCancelling(false);
    }
  };

  const currentStatus = selectedOrderResult?.order.status;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. ACTIVE ORDER CONFIRMED VIEW & FSM TRACKER */}
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
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID Заказа</div>
              <code style={{ fontSize: '0.85rem', color: 'var(--emerald)', fontFamily: 'var(--font-mono)' }}>
                {selectedOrderResult.order.id.slice(0, 8)}...
              </code>
            </div>
          </div>

          {/* STATUS STEPPER PROGRESS BAR */}
          {currentStatus !== 'CANCELLED' && (
            <div style={{ display: 'flex', gap: '0.5rem', margin: '1.25rem 0', flexWrap: 'wrap' }}>
              {[
                { id: 'PROVIDER_SELECTED', label: '1. Выбран' },
                { id: 'EN_ROUTE', label: '2. В пути' },
                { id: 'ARRIVED', label: '3. Прибыл' },
                { id: 'IN_PROGRESS', label: '4. В работе' },
                { id: 'COMPLETED', label: '5. Завершен' },
              ].map((step, idx) => {
                const stepOrder = ['PROVIDER_SELECTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
                const currentIdx = stepOrder.indexOf(currentStatus || 'PROVIDER_SELECTED');
                const isPassed = currentIdx >= idx;
                const isCurrent = currentIdx === idx;

                return (
                  <div
                    key={step.id}
                    style={{
                      flex: '1 1 120px',
                      padding: '0.6rem 0.8rem',
                      borderRadius: 'var(--radius-sm)',
                      background: isCurrent
                        ? 'rgba(59, 130, 246, 0.25)'
                        : isPassed
                        ? 'rgba(16, 185, 129, 0.15)'
                        : 'rgba(15, 23, 42, 0.5)',
                      border: isCurrent
                        ? '1px solid var(--primary)'
                        : isPassed
                        ? '1px solid rgba(16, 185, 129, 0.4)'
                        : '1px solid var(--border-subtle)',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isCurrent ? '#93c5fd' : isPassed ? '#34d399' : '#64748b' }}>
                      {step.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ORDER DETAILS SUMMARY */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              margin: '1.25rem 0',
              padding: '1.25rem',
              background: 'rgba(15, 23, 42, 0.7)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Исполнитель</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', marginTop: '0.2rem' }}>
                {selectedOrderResult.provider.businessName}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--amber)', marginTop: '0.2rem' }}>
                ⭐ {selectedOrderResult.provider.rating.toFixed(1)} Рейтинг
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {currentStatus === 'COMPLETED' ? 'Итоговая стоимость' : 'Согласованная стоимость'}
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#34d399', marginTop: '0.2rem' }}>
                {selectedOrderResult.order.finalAmountTiyn
                  ? `${(selectedOrderResult.order.finalAmountTiyn / 100).toLocaleString()} ₸ (Оплачено)`
                  : selectedOrderResult.offer.pricingMode === 'fixed'
                  ? `${((selectedOrderResult.offer.amountTiyn || 0) / 100).toLocaleString()} ₸`
                  : selectedOrderResult.offer.pricingMode === 'diagnostic_fee'
                  ? `${((selectedOrderResult.offer.amountTiyn || 0) / 100).toLocaleString()} ₸ (Диагностика)`
                  : `${((selectedOrderResult.offer.minAmountTiyn || 0) / 100).toLocaleString()}–${((selectedOrderResult.offer.maxAmountTiyn || 0) / 100).toLocaleString()} ₸`}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Оплата на месте</div>
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Расчетное время (ETA)</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', marginTop: '0.2rem' }}>
                ~ {selectedOrderResult.offer.etaMinutes} минут
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>По дорогам Астаны</div>
            </div>
          </div>

          {/* REVIEW FORM ON ORDER COMPLETION */}
          {currentStatus === 'COMPLETED' && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                margin: '1.25rem 0',
              }}
            >
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.5rem', color: '#34d399' }}>
                ⭐ Оцените работу мастера
              </h3>

              {reviewSubmitted ? (
                <div style={{ color: '#34d399', fontWeight: 700, fontSize: '0.95rem' }}>
                  ✓ Спасибо! Ваш отзыв учтен и рейтинг мастера обновлен.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Ваша оценка:</span>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '1.5rem',
                          cursor: 'pointer',
                          color: star <= reviewRating ? '#f59e0b' : '#475569',
                          transition: 'transform 0.1s',
                        }}
                      >
                        ★
                      </button>
                    ))}
                    <span style={{ fontWeight: 700, color: '#f59e0b' }}>{reviewRating} из 5</span>
                  </div>

                  <input
                    type="text"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Напишите пару слов о мастере..."
                    className="form-input"
                  />

                  <button
                    onClick={handleSubmitReview}
                    disabled={isSubmittingReview}
                    className="btn-emerald"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {isSubmittingReview ? 'Отправка...' : 'Отправить отзыв'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ACTIONS BAR */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {currentStatus !== 'COMPLETED' && currentStatus !== 'CANCELLED' && (
              <>
                <button
                  onClick={() => alert('Прямой звонок мастеру: +7 (702) 111-22-33')}
                  className="btn-primary"
                  style={{ flex: '1 1 180px' }}
                >
                  📞 Позвонить мастеру
                </button>
                <button
                  onClick={() => alert('Открытие чата WhatsApp с мастером')}
                  className="btn-emerald"
                  style={{ flex: '1 1 180px' }}
                >
                  💬 Написать в WhatsApp
                </button>
                {['PROVIDER_SELECTED', 'EN_ROUTE', 'ARRIVED'].includes(currentStatus || '') && (
                  <button
                    onClick={handleCancelOrder}
                    disabled={isCancelling}
                    className="btn-secondary"
                    style={{ color: '#fda4af', borderColor: 'rgba(244, 63, 94, 0.3)' }}
                  >
                    {isCancelling ? 'Отмена...' : '✕ Отменить заказ'}
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => {
                setCreatedRequestId(null);
                setSelectedOrderResult(null);
                setOffers([]);
                setReviewSubmitted(false);
              }}
              className="btn-secondary"
            >
              + Новая заявка
            </button>
          </div>
        </div>
      ) : (
        /* 2. REQUEST CREATION & RADAR DISPATCH WIZARD */
        <>
          <div className="glass-card" style={{ padding: '1.75rem' }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <span className="badge badge-blue">Шаг 1 из 2</span>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.35rem' }}>
                Какая помощь требуется автомобилю?
              </h2>
            </div>

            {/* Category Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {[
                {
                  id: 'battery_jumpstart',
                  title: '🔋 Прикурить / АКБ',
                  desc: 'Срочная прикурка 12V/24V бустером, доставка и замена аккумулятора',
                },
                {
                  id: 'electrical_starting',
                  title: '⚡ Автоэлектрик / Запуск',
                  desc: 'Компьютерная диагностика, стартер, генератор, сигнализация',
                },
                {
                  id: 'mobile_mechanic',
                  title: '🔧 Мобильный механик',
                  desc: 'Мелкий ремонт на месте поломки, патрубки, свечи, замена колеса',
                },
              ].map((cat) => (
                <div
                  key={cat.id}
                  onClick={() => setCategory(cat.id as ServiceCategory)}
                  className={`category-card ${category === cat.id ? 'selected' : ''}`}
                >
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: category === cat.id ? '#93c5fd' : '#f8fafc' }}>
                    {cat.title}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {cat.desc}
                  </div>
                </div>
              ))}
            </div>

            {/* Location & Map Picker */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <label style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  📍 Место поломки в Астане
                </label>
                <button
                  onClick={handleGetLocation}
                  disabled={isLocating}
                  className="btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                >
                  {isLocating ? 'Определяю...' : '🎯 Моя геопозиция'}
                </button>
              </div>

              {/* Landmark quick preset chips */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {ASTANA_LANDMARKS.map((lm) => (
                  <button
                    key={lm.name}
                    type="button"
                    onClick={() => {
                      setCoords({ lat: lm.lat, lng: lm.lng });
                      setLocationName(lm.name);
                    }}
                    className={`chip ${coords.lat === lm.lat && coords.lng === lm.lng ? 'active' : ''}`}
                  >
                    {lm.name.split(' (')[0]}
                  </button>
                ))}
              </div>

              {/* Interactive Astana Leaflet Map */}
              <AstanaMap
                center={coords}
                radiusKm={5}
                onLocationChange={(newCoords, name) => {
                  setCoords(newCoords);
                  setLocationName(name);
                }}
                providerPins={onlineProviders}
              />
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                Кликните по карте, чтобы переместить метку места поломки
              </div>
            </div>

            {/* Problem Description */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                Детали поломки (марка авто, симптомы)
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Например: Toyota Camry 2020, сел аккумулятор во дворе"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Create Request Action */}
            <button
              onClick={handleCreateRequest}
              disabled={isPublishing}
              className="btn-primary"
              style={{ width: '100%', padding: '1rem', fontSize: '1.05rem' }}
            >
              {isPublishing ? '🚀 Поиск мастеров в радиусе 5 км...' : '🚀 Найти мастера поблизости (Радиус: 5 км)'}
            </button>
          </div>

          {/* 3. RADAR SEARCHING & INCOMING OFFERS SECTION */}
          {createdRequestId && (
            <div className="glass-card" style={{ padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <span className="badge badge-emerald">Поиск активен</span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.3rem' }}>
                    Предложения от мастеров ({offers.length})
                  </h3>
                </div>
                <button
                  onClick={fetchOffers}
                  className="btn-secondary"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                >
                  🔄 Обновить
                </button>
              </div>

              {offers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                  <div className="radar-container" style={{ marginBottom: '1rem' }}>
                    <div className="radar-circle"></div>
                    <div className="radar-circle"></div>
                    <div className="radar-circle"></div>
                    <div className="radar-dot"></div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                    Оповещаем мастеров в радиусе 5 км...
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                    Найдено мастеров на линии: <strong>{matchedCount ?? '...'}</strong>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                    💡 Совет: Переключитесь на вкладку «🔧 Кабинет Мастера» вверху, чтобы отправить оффер от лица исполнителя!
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {offers.map((offer) => (
                    <div
                      key={offer.id}
                      style={{
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1.25rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '1rem',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                          {offer.businessName}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          ⭐ {offer.rating.toFixed(1)} ({offer.completedJobs} заказов) | ⏱ Прибудет через{' '}
                          <strong style={{ color: '#60a5fa' }}>{offer.etaMinutes} мин</strong>
                        </div>
                        {offer.message && (
                          <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '0.4rem', fontStyle: 'italic' }}>
                            «{offer.message}»
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399' }}>
                            {offer.pricingMode === 'fixed' &&
                              `${((offer.amountTiyn || 0) / 100).toLocaleString()} ₸ (Фикс)`}
                            {offer.pricingMode === 'diagnostic_fee' &&
                              `${((offer.amountTiyn || 0) / 100).toLocaleString()} ₸ (Выезд + Диагностика)`}
                            {offer.pricingMode === 'estimate_range' &&
                              `${((offer.minAmountTiyn || 0) / 100).toLocaleString()}–${((offer.maxAmountTiyn || 0) / 100).toLocaleString()} ₸`}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Оплата на месте</div>
                        </div>

                        <button
                          onClick={() => handleSelectOffer(offer.id)}
                          disabled={selectingOfferId === offer.id}
                          className="btn-emerald"
                          style={{ padding: '0.75rem 1.4rem' }}
                        >
                          {selectingOfferId === offer.id ? 'Выбираем...' : 'Выбрать мастера'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
