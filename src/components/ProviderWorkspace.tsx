'use client';

import React, { useState } from 'react';
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
  getDemoToken: (userId?: string, providerId?: string) => Promise<string | null>;
  createdRequestId: string | null;
  selectedOrderResult: OrderResult | null;
  setSelectedOrderResult?: (res: OrderResult | null | ((prev: OrderResult | null) => OrderResult | null)) => void;
}

export default function ProviderWorkspace({
  getDemoToken,
  createdRequestId,
  selectedOrderResult,
  setSelectedOrderResult,
}: ProviderWorkspaceProps) {
  const [activeProviderIndex, setActiveProviderIndex] = useState<number>(0);
  const activeProvider = DEMO_PROVIDERS[activeProviderIndex];

  // Bid Form State
  const [pricingMode, setPricingMode] = useState<PricingMode>('diagnostic_fee');
  const [priceKzt, setPriceKzt] = useState<number>(5000);
  const [minPriceKzt, setMinPriceKzt] = useState<number>(10000);
  const [maxPriceKzt, setMaxPriceKzt] = useState<number>(20000);
  const [etaMinutes, setEtaMinutes] = useState<number>(15);
  const [message, setMessage] = useState<string>('Выезжаю с профессиональным оборудованием. Буду вовремя.');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitFeedback, setSubmitFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Status Action State
  const [finalPriceKzt, setFinalPriceKzt] = useState<number>(5000);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Submit Bid from Active Provider
  const handleSendOffer = async () => {
    if (!createdRequestId) {
      alert('Нет активной открытой заявки клиента для отклика.');
      return;
    }

    setIsSubmitting(true);
    setSubmitFeedback(null);

    try {
      const providerToken = await getDemoToken(undefined, activeProvider.id);
      if (!providerToken) {
        setSubmitFeedback({ ok: false, msg: 'Ошибка получения демо-токена мастера' });
        return;
      }

      interface OfferPayload {
        requestId: string;
        pricingMode: PricingMode;
        amountTiyn?: number;
        minAmountTiyn?: number;
        maxAmountTiyn?: number;
        etaMinutes: number;
        message?: string;
      }

      const body: OfferPayload = {
        requestId: createdRequestId,
        pricingMode,
        etaMinutes,
        message: message ? message.trim() : undefined,
      };

      if (pricingMode === 'fixed' || pricingMode === 'diagnostic_fee') {
        body.amountTiyn = priceKzt * 100;
      } else {
        body.minAmountTiyn = minPriceKzt * 100;
        body.maxAmountTiyn = maxPriceKzt * 100;
      }

      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${providerToken}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setSubmitFeedback({
          ok: true,
          msg: `✅ Оффер от «${activeProvider.name}» успешно отправлен клиенту! Переключитесь на вкладку «Режим Автомобилиста», чтобы увидеть его.`,
        });
      } else {
        setSubmitFeedback({
          ok: false,
          msg: `❌ Ошибка: ${data.error?.message || 'Не удалось отправить предложение'}`,
        });
      }
    } catch (e: unknown) {
      setSubmitFeedback({
        ok: false,
        msg: `❌ Сбой сети: ${e instanceof Error ? e.message : 'Unknown error'}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Master updates order status via FSM
  const handleTransitionStatus = async (nextStatus: string) => {
    if (!selectedOrderResult) return;
    setIsUpdatingStatus(true);
    setStatusFeedback(null);

    try {
      const providerToken = await getDemoToken(undefined, activeProvider.id);
      if (!providerToken) {
        setStatusFeedback('❌ Ошибка авторизации мастера');
        return;
      }

      const body: { status: string; finalAmountTiyn?: number; note?: string } = {
        status: nextStatus,
      };

      if (nextStatus === 'COMPLETED') {
        body.finalAmountTiyn = finalPriceKzt * 100;
        body.note = `Работы завершены. Оплата: ${finalPriceKzt.toLocaleString()} ₸`;
      } else if (nextStatus === 'EN_ROUTE') {
        body.note = 'Мастер выехал к автомобилю';
      } else if (nextStatus === 'ARRIVED') {
        body.note = 'Мастер прибыл на место поломки';
      } else if (nextStatus === 'IN_PROGRESS') {
        body.note = 'Мастер приступил к диагностике и ремонту';
      }

      const res = await fetch(`/api/orders/${selectedOrderResult.order.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${providerToken}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setStatusFeedback(`✓ Статус успешно изменен на: ${nextStatus}`);
        if (setSelectedOrderResult) {
          setSelectedOrderResult((prev) =>
            prev
              ? {
                  ...prev,
                  order: {
                    ...prev.order,
                    status: nextStatus,
                    finalAmountTiyn: nextStatus === 'COMPLETED' ? finalPriceKzt * 100 : prev.order.finalAmountTiyn,
                  },
                }
              : null
          );
        }
      } else {
        setStatusFeedback(`❌ Ошибка: ${data.error?.message || 'Сбой'}`);
      }
    } catch (e: unknown) {
      setStatusFeedback(`❌ Ошибка сети: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const isSelectedProvider = selectedOrderResult?.provider.id === activeProvider.id;
  const currentOrderStatus = selectedOrderResult?.order.status;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. MASTER PROFILE SELECTOR BAR */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <span className="badge badge-emerald">Рабочее место мастера</span>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '0.25rem' }}>
              Выберите профиль мастера для симуляции
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '10px', height: '10px', background: '#10b981', borderRadius: '50%', boxShadow: '0 0 10px #10b981' }}></span>
            <span style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 700 }}>В онлайне (Астана)</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          {DEMO_PROVIDERS.map((p, idx) => (
            <div
              key={p.id}
              onClick={() => {
                setActiveProviderIndex(idx);
                setSubmitFeedback(null);
                setStatusFeedback(null);
              }}
              style={{
                background: activeProviderIndex === idx ? 'rgba(16, 185, 129, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                border: activeProviderIndex === idx ? '2px solid #10b981' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: activeProviderIndex === idx ? '#34d399' : '#f8fafc' }}>
                {p.name}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                {p.type}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--amber)', marginTop: '0.35rem' }}>
                ⭐ {p.rating.toFixed(1)} ({p.completedJobs} заказов) | Радиус: {p.radiusKm} км
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. ACCEPTED ORDER CONTROLS IF THIS PROVIDER WAS SELECTED */}
      {selectedOrderResult && isSelectedProvider && (
        <div className="glass-card" style={{ padding: '1.75rem', border: '2px solid #10b981' }}>
          <span className="badge badge-emerald">🎉 Вас выбрали исполнителем!</span>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.4rem' }}>
            Управление активным заказом
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Текущий статус заказа:{' '}
            <strong style={{ color: '#34d399', fontFamily: 'var(--font-mono)' }}>{currentOrderStatus}</strong>
          </p>

          <div
            style={{
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              margin: '1.25rem 0',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Клиент</div>
                <div style={{ fontWeight: 800, color: '#f8fafc', fontSize: '1.1rem' }}>
                  Автомобилист (Астана)
                </div>
                <div style={{ fontSize: '0.8rem', color: '#60a5fa', marginTop: '0.2rem' }}>
                  📍 Координаты разблокированы
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Согласованная цена</div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#f8fafc' }}>
                  {selectedOrderResult.offer.pricingMode === 'fixed' &&
                    `${((selectedOrderResult.offer.amountTiyn || 0) / 100).toLocaleString()} ₸`}
                  {selectedOrderResult.offer.pricingMode === 'diagnostic_fee' &&
                    `${((selectedOrderResult.offer.amountTiyn || 0) / 100).toLocaleString()} ₸ (Диагностика)`}
                  {selectedOrderResult.offer.pricingMode === 'estimate_range' &&
                    `${((selectedOrderResult.offer.minAmountTiyn || 0) / 100).toLocaleString()}–${((selectedOrderResult.offer.maxAmountTiyn || 0) / 100).toLocaleString()} ₸`}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Обещанный ETA</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>~ {selectedOrderResult.offer.etaMinutes} мин</div>
              </div>
            </div>
          </div>

          {/* MASTER FSM CONTROLS */}
          <div style={{ marginTop: '1.25rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
              Действия мастера по заказу:
            </h4>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {currentOrderStatus === 'PROVIDER_SELECTED' && (
                <button
                  onClick={() => handleTransitionStatus('EN_ROUTE')}
                  disabled={isUpdatingStatus}
                  className="btn-primary"
                >
                  🚗 1. Выехал к клиенту (EN_ROUTE)
                </button>
              )}

              {currentOrderStatus === 'EN_ROUTE' && (
                <button
                  onClick={() => handleTransitionStatus('ARRIVED')}
                  disabled={isUpdatingStatus}
                  className="btn-primary"
                >
                  📍 2. Прибыл на место (ARRIVED)
                </button>
              )}

              {currentOrderStatus === 'ARRIVED' && (
                <button
                  onClick={() => handleTransitionStatus('IN_PROGRESS')}
                  disabled={isUpdatingStatus}
                  className="btn-primary"
                >
                  🔧 3. Приступил к работе (IN_PROGRESS)
                </button>
              )}

              {currentOrderStatus === 'IN_PROGRESS' && (
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>
                      Итоговая сумма к оплате (₸):
                    </label>
                    <input
                      type="number"
                      value={finalPriceKzt}
                      onChange={(e) => setFinalPriceKzt(Number(e.target.value))}
                      className="form-input"
                      style={{ width: '160px' }}
                    />
                  </div>
                  <button
                    onClick={() => handleTransitionStatus('COMPLETED')}
                    disabled={isUpdatingStatus}
                    className="btn-emerald"
                    style={{ alignSelf: 'flex-end' }}
                  >
                    ✓ 4. Завершить заказ и расчет (COMPLETED)
                  </button>
                </div>
              )}

              {currentOrderStatus === 'COMPLETED' && (
                <div style={{ color: '#34d399', fontWeight: 700 }}>
                  ✓ Заказ успешно выполнен! Зачислено в историю выполненных работ.
                </div>
              )}
            </div>

            {statusFeedback && (
              <div style={{ marginTop: '0.75rem', fontWeight: 600, fontSize: '0.9rem', color: '#93c5fd' }}>
                {statusFeedback}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. INCOMING FEED & BID SUBMISSION FORM */}
      {!selectedOrderResult && (
        <div className="glass-card" style={{ padding: '1.75rem' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <span className="badge badge-blue">Входящая заявка</span>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: '0.35rem' }}>
              {createdRequestId ? '📍 Доступна новая заявка в вашем радиусе!' : 'Ожидание новых заявок...'}
            </h3>
          </div>

          {createdRequestId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Автомобиль требует автопомощи</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      Радиус: в пределах 5 км от вас (Астана)
                    </div>
                  </div>
                  <span className="badge badge-amber">Статус: PUBLISHED</span>
                </div>
              </div>

              {/* Bid Form */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                    Тип ценообразования:
                  </label>
                  <select
                    value={pricingMode}
                    onChange={(e) => setPricingMode(e.target.value as PricingMode)}
                    className="form-select"
                  >
                    <option value="diagnostic_fee">Выезд + диагностика (Diagnostic Fee)</option>
                    <option value="fixed">Фиксированная стоимость (Fixed Price)</option>
                    <option value="estimate_range">Ориентировочный диапазон (Range)</option>
                  </select>
                </div>

                {pricingMode !== 'estimate_range' ? (
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                      Стоимость (₸):
                    </label>
                    <input
                      type="number"
                      value={priceKzt}
                      onChange={(e) => setPriceKzt(Number(e.target.value))}
                      className="form-input"
                    />
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                        Мин (₸):
                      </label>
                      <input
                        type="number"
                        value={minPriceKzt}
                        onChange={(e) => setMinPriceKzt(Number(e.target.value))}
                        className="form-input"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                        Макс (₸):
                      </label>
                      <input
                        type="number"
                        value={maxPriceKzt}
                        onChange={(e) => setMaxPriceKzt(Number(e.target.value))}
                        className="form-input"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                    Время прибытия (ETA мин):
                  </label>
                  <input
                    type="number"
                    value={etaMinutes}
                    onChange={(e) => setEtaMinutes(Number(e.target.value))}
                    className="form-input"
                  />
                </div>
              </div>

              {/* Quick ETA Chips */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Быстрый выбор ETA:</span>
                {[10, 15, 20, 30, 45].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setEtaMinutes(mins)}
                    className={`chip ${etaMinutes === mins ? 'active' : ''}`}
                  >
                    {mins} мин
                  </button>
                ))}
              </div>

              {/* Message to customer */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                  Сообщение клиенту:
                </label>
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="form-input"
                />
              </div>

              {/* Submit Bid Button */}
              <button
                onClick={handleSendOffer}
                disabled={isSubmitting}
                className="btn-emerald"
                style={{ padding: '0.9rem', fontSize: '1rem', width: '100%' }}
              >
                {isSubmitting ? 'Отправка предложения...' : `📩 Отправить оффер от «${activeProvider.name}»`}
              </button>

              {submitFeedback && (
                <div
                  style={{
                    padding: '0.9rem 1.1rem',
                    borderRadius: 'var(--radius-sm)',
                    background: submitFeedback.ok ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                    border: `1px solid ${submitFeedback.ok ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                    color: submitFeedback.ok ? '#34d399' : '#fda4af',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                >
                  {submitFeedback.msg}
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Сейчас нет открытых заявок. Перейдите во вкладку «Режим Автомобилиста» и создайте заявку для теста!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
