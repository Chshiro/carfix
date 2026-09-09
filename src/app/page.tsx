'use client';

import React, { useState, useEffect } from 'react';

type ServiceCategory = 'electrical_starting' | 'battery_jumpstart' | 'mobile_mechanic';
type PricingMode = 'fixed' | 'diagnostic_fee' | 'estimate_range';

interface MatchedProvider {
  providerId: string;
  businessName: string;
  providerType: string;
  verificationLevel: string;
  rating: number;
  completedJobs: number;
  distanceKm: number;
}

interface OfferItem {
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

const SEED_CUSTOMER_ID = 'c0000000-0000-0000-0000-000000000001';

const SEED_PROVIDERS = [
  { id: 'b1000000-0000-0000-0000-000000000001', name: 'Мастер Азамат (Автоэлектрик/АКБ)' },
  { id: 'b2000000-0000-0000-0000-000000000002', name: 'СТО Барыс (Диагностика/Электрика)' },
  { id: 'b3000000-0000-0000-0000-000000000003', name: 'Срочная Прикурка Астана (Бауыржан)' },
  { id: 'b4000000-0000-0000-0000-000000000004', name: 'Мобильный Механик Данияр' },
  { id: 'b5000000-0000-0000-0000-000000000005', name: 'Универсал Автопомощь (Тимур)' },
];

export default function App() {
  const [category, setCategory] = useState<ServiceCategory>('electrical_starting');
  const [lat, setLat] = useState<number>(51.1283);
  const [lng, setLng] = useState<number>(71.4305);
  const [locationName, setLocationName] = useState<string>('Астана (район Байтерек / Есиль)');
  const [description, setDescription] = useState<string>('');
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

  // Request State
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [matchedCount, setMatchedCount] = useState<number | null>(null);
  const [matchedProviders, setMatchedProviders] = useState<MatchedProvider[]>([]);

  // Offers State
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [selectedOrderResult, setSelectedOrderResult] = useState<any>(null);

  // Provider Sandbox Form State
  const [activeProviderId, setActiveProviderId] = useState<string>(SEED_PROVIDERS[0].id);
  const [offerPricingMode, setOfferPricingMode] = useState<PricingMode>('diagnostic_fee');
  const [offerPriceKzt, setOfferPriceKzt] = useState<number>(5000);
  const [offerMinPriceKzt, setOfferMinPriceKzt] = useState<number>(15000);
  const [offerMaxPriceKzt, setOfferMaxPriceKzt] = useState<number>(25000);
  const [offerEta, setOfferEta] = useState<number>(25);
  const [offerMessage, setOfferMessage] = useState<string>('Могу приехать быстро с оборудованием');
  const [isSubmittingOffer, setIsSubmittingOffer] = useState<boolean>(false);
  const [offerStatusMsg, setOfferStatusMsg] = useState<string | null>(null);

  // Geolocation handler
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('Геолокация не поддерживается вашим браузером');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocationName(`Координаты: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        setIsLocating(false);
      },
      (err) => {
        alert(`Не удалось определить геопозицию (${err.message}). Используются координаты центра Астаны.`);
        setIsLocating(false);
      }
    );
  };

  // Submit Request
  const handleCreateRequest = async () => {
    setIsPublishing(true);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: SEED_CUSTOMER_ID,
          category,
          location: { lat, lng },
          description: description || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setCreatedRequestId(data.data.requestId);
        setMatchedCount(data.data.matchedProvidersCount);
        setMatchedProviders(data.data.matchedProviders || []);
        setSelectedOrderResult(null);
        setOffers([]);
      } else {
        alert(`Ошибка создания заявки: ${data.error?.message || 'Неизвестная ошибка'}`);
      }
    } catch (e: any) {
      alert(`Сбой сети: ${e.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  // Poll / Fetch Offers for Created Request
  const fetchOffers = React.useCallback(async () => {
    if (!createdRequestId) return;
    try {
      const res = await fetch(`/api/requests/${createdRequestId}/offers?userId=${SEED_CUSTOMER_ID}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setOffers(data.data);
      }
    } catch (e) {
      console.error('Error fetching offers:', e);
    }
  }, [createdRequestId]);

  useEffect(() => {
    if (!createdRequestId || selectedOrderResult) return;
    fetchOffers();
    const interval = setInterval(fetchOffers, 3000);
    return () => clearInterval(interval);
  }, [createdRequestId, selectedOrderResult, fetchOffers]);

  // Submit Offer from Provider Sandbox
  const handleSendOffer = async () => {
    if (!createdRequestId) {
      alert('Сначала создайте заявку');
      return;
    }
    setIsSubmittingOffer(true);
    setOfferStatusMsg(null);

    const body: any = {
      requestId: createdRequestId,
      providerId: activeProviderId,
      pricingMode: offerPricingMode,
      etaMinutes: offerEta,
      message: offerMessage || undefined,
    };

    if (offerPricingMode === 'fixed' || offerPricingMode === 'diagnostic_fee') {
      body.amountTiyn = offerPriceKzt * 100;
    } else {
      body.minAmountTiyn = offerMinPriceKzt * 100;
      body.maxAmountTiyn = offerMaxPriceKzt * 100;
    }

    try {
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setOfferStatusMsg('✅ Предложение успешно отправлено клиенту!');
        fetchOffers();
      } else {
        setOfferStatusMsg(`❌ Ошибка: ${data.error?.message || 'Сбой'}`);
      }
    } catch (e: any) {
      setOfferStatusMsg(`❌ Ошибка сети: ${e.message}`);
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  // Select Offer (Customer Atomic Action)
  const handleSelectOffer = async (offerId: string) => {
    if (!createdRequestId) return;
    try {
      const res = await fetch(`/api/requests/${createdRequestId}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId,
          customerId: SEED_CUSTOMER_ID,
        }),
      });

      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setSelectedOrderResult(data.data);
      } else {
        alert(`Ошибка выбора мастера: ${data.error?.message || 'Сбой'}`);
      }
    } catch (e: any) {
      alert(`Сбой сети: ${e.message}`);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 0.5rem 0', color: '#0f172a' }}>🚗 CarFix — Скорая автопомощь в Астане</h1>
        <p style={{ margin: 0, color: '#64748b' }}>Real-Time Automotive Marketplace | End-to-End Vertical Slice</p>
      </header>

      {/* STEP 1: CUSTOMER REQUEST WIZARD */}
      <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginTop: 0, color: '#1e293b' }}>1. Нужна помощь с машиной?</h2>

        {/* Category Picker */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { id: 'electrical_starting', title: '⚡ Не заводится / электрика', desc: 'Стартер, компьютерная диагностика, зажигание' },
            { id: 'battery_jumpstart', title: '🔋 Аккумулятор / прикурить', desc: 'Прикурка 12V/24V, доставка и замена АКБ' },
            { id: 'mobile_mechanic', title: '🔧 Мобильный механик', desc: 'Мелкий ремонт на месте, ремни, патрубки, свечи' },
          ].map((cat) => (
            <div
              key={cat.id}
              onClick={() => setCategory(cat.id as ServiceCategory)}
              style={{
                border: category === cat.id ? '2px solid #2563eb' : '1px solid #cbd5e1',
                background: category === cat.id ? '#eff6ff' : '#f8fafc',
                borderRadius: '8px',
                padding: '1rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontWeight: 600, color: category === cat.id ? '#1d4ed8' : '#334155' }}>{cat.title}</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>{cat.desc}</div>
            </div>
          ))}
        </div>

        {/* Location Picker */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#334155' }}>
            📍 Где находится машина?
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              style={{ flex: 1, minWidth: '240px', padding: '0.6rem 0.8rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
            />
            <button
              onClick={handleGetLocation}
              disabled={isLocating}
              style={{ padding: '0.6rem 1rem', background: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
            >
              {isLocating ? 'Определяю...' : '🎯 Моя геопозиция'}
            </button>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
            GPS Координаты: {lat.toFixed(5)}, {lng.toFixed(5)}
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#334155' }}>
            Описание проблемы (опционально)
          </label>
          <input
            type="text"
            placeholder="Например: Toyota Camry 2018, стартер щелкает но не крутит"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.8rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
          />
        </div>

        {/* Submit Request */}
        <button
          onClick={handleCreateRequest}
          disabled={isPublishing}
          style={{
            width: '100%',
            padding: '0.85rem',
            background: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1.05rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {isPublishing ? 'Публикация заявки...' : '🚀 Найти мастера (Радиус: 5 км)'}
        </button>
      </div>

      {/* REQUEST PUBLISHED & MATCHED RESULT */}
      {createdRequestId && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#166534' }}>✅ Заявка успешно создана и опубликована!</h3>
          <p style={{ margin: '0.25rem 0', color: '#15803d' }}>
            <strong>ID заявки:</strong> <code style={{ background: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>{createdRequestId}</code>
          </p>
          <p style={{ margin: '0.25rem 0', color: '#15803d' }}>
            <strong>Найдено подходящих мастеров поблизости:</strong> <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{matchedCount}</span>
          </p>
          <p style={{ margin: '0.25rem 0', color: '#15803d' }}>
            <strong>Радиус поиска:</strong> 5 км | <strong>Статус:</strong> PUBLISHED
          </p>

          {matchedProviders.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontWeight: 600, color: '#166534', marginBottom: '0.5rem' }}>Подходящие мастера в радиусе:</div>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#14532d' }}>
                {matchedProviders.map((p) => (
                  <li key={p.providerId} style={{ marginBottom: '0.25rem' }}>
                    <strong>{p.businessName}</strong> ({p.providerType}) — ⭐ {p.rating.toFixed(1)} ({p.completedJobs} заказов) — 📍 ~{p.distanceKm} км
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: PROVIDER SANDBOX & TEST INTERFACE */}
      {createdRequestId && !selectedOrderResult && (
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
          <h3 style={{ marginTop: 0, color: '#0f172a' }}>🛠️ Тестовый интерфейс исполнителя (Симуляция отклика мастера)</h3>
          <p style={{ fontSize: '0.9rem', color: '#64748b' }}>
            В реальном режиме мастер получает пуш в Telegram. Здесь вы можете выбрать мастера и отправить оффер для проверки:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Исполнитель:</label>
              <select
                value={activeProviderId}
                onChange={(e) => setActiveProviderId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                {SEED_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Тип цены:</label>
              <select
                value={offerPricingMode}
                onChange={(e) => setOfferPricingMode(e.target.value as PricingMode)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                <option value="diagnostic_fee">Выезд + диагностика (Diagnostic Fee)</option>
                <option value="fixed">Фиксированная цена (Fixed Price)</option>
                <option value="estimate_range">Ориентировочный диапазон (Range)</option>
              </select>
            </div>

            {offerPricingMode !== 'estimate_range' ? (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Цена (₸):</label>
                <input
                  type="number"
                  value={offerPriceKzt}
                  onChange={(e) => setOfferPriceKzt(Number(e.target.value))}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Мин (₸):</label>
                  <input
                    type="number"
                    value={offerMinPriceKzt}
                    onChange={(e) => setOfferMinPriceKzt(Number(e.target.value))}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Макс (₸):</label>
                  <input
                    type="number"
                    value={offerMaxPriceKzt}
                    onChange={(e) => setOfferMaxPriceKzt(Number(e.target.value))}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Прибуду через (мин):</label>
              <input
                type="number"
                value={offerEta}
                onChange={(e) => setOfferEta(Number(e.target.value))}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Сообщение клиенту:</label>
            <input
              type="text"
              value={offerMessage}
              onChange={(e) => setOfferMessage(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <button
            onClick={handleSendOffer}
            disabled={isSubmittingOffer}
            style={{
              padding: '0.65rem 1.25rem',
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isSubmittingOffer ? 'Отправка...' : '📩 Отправить предложение от лица мастера'}
          </button>

          {offerStatusMsg && (
            <div style={{ marginTop: '0.75rem', fontWeight: 500 }}>{offerStatusMsg}</div>
          )}
        </div>
      )}

      {/* STEP 3: CUSTOMER LIVE OFFERS & SELECTION */}
      {createdRequestId && !selectedOrderResult && (
        <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, color: '#1e293b' }}>
              2. Поступившие предложения от мастеров ({offers.length})
            </h2>
            <button
              onClick={fetchOffers}
              style={{ padding: '0.4rem 0.8rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              🔄 Обновить
            </button>
          </div>

          {offers.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', color: '#64748b' }}>
              Ожидание предложений от мастеров... (Отправьте тестовый оффер из блока выше)
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '1.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    background: '#ffffff',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>{offer.businessName}</div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                      ⭐ {offer.rating.toFixed(1)} ({offer.completedJobs} заказов) | ⏱ Прибудет через {offer.etaMinutes} мин
                    </div>
                    {offer.message && (
                      <div style={{ fontSize: '0.9rem', color: '#334155', marginTop: '0.5rem', fontStyle: 'italic' }}>
                        «{offer.message}»
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e293b' }}>
                        {offer.pricingMode === 'fixed' && `${((offer.amountTiyn || 0) / 100).toLocaleString()} ₸ (Фикс)`}
                        {offer.pricingMode === 'diagnostic_fee' && `${((offer.amountTiyn || 0) / 100).toLocaleString()} ₸ (Выезд + Диагностика)`}
                        {offer.pricingMode === 'estimate_range' && `${((offer.minAmountTiyn || 0) / 100).toLocaleString()}–${((offer.maxAmountTiyn || 0) / 100).toLocaleString()} ₸ (Ориентир)`}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Оплата на месте</div>
                    </div>

                    <button
                      onClick={() => handleSelectOffer(offer.id)}
                      style={{
                        padding: '0.7rem 1.25rem',
                        background: '#16a34a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Выбрать мастера
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 4: ORDER CREATED & CONFIRMED VIEW */}
      {selectedOrderResult && (
        <div style={{ background: '#f0fdf4', border: '2px solid #22c55e', borderRadius: '12px', padding: '1.75rem', marginBottom: '2rem' }}>
          <h2 style={{ marginTop: 0, color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🎉 Мастер выбран! Заказ подтвержден
          </h2>

          <div style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '1.25rem', marginTop: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Исполнитель:</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>{selectedOrderResult.provider.businessName}</div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>⭐ {selectedOrderResult.provider.rating.toFixed(1)}</div>
              </div>

              <div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Согласованная цена:</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#166534' }}>
                  {selectedOrderResult.offer.pricingMode === 'fixed' && `${(selectedOrderResult.offer.amountTiyn / 100).toLocaleString()} ₸`}
                  {selectedOrderResult.offer.pricingMode === 'diagnostic_fee' && `${(selectedOrderResult.offer.amountTiyn / 100).toLocaleString()} ₸ (Диагностика)`}
                  {selectedOrderResult.offer.pricingMode === 'estimate_range' && `${(selectedOrderResult.offer.minAmountTiyn / 100).toLocaleString()}–${(selectedOrderResult.offer.maxAmountTiyn / 100).toLocaleString()} ₸`}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Время прибытия (ETA):</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>~{selectedOrderResult.offer.etaMinutes} минут</div>
              </div>

              <div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Статус заказа:</div>
                <div style={{ fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', display: 'inline-block', padding: '2px 8px', borderRadius: '4px' }}>
                  {selectedOrderResult.order.status}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => alert('Прямой звонок мастеру: +7 (702) 111-22-33')}
                style={{ padding: '0.65rem 1.25rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
              >
                📞 Позвонить мастеру
              </button>
              <button
                onClick={() => alert('Открытие чата WhatsApp: https://wa.me/77021112233')}
                style={{ padding: '0.65rem 1.25rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
              >
                💬 Написать в WhatsApp
              </button>
              <button
                onClick={() => {
                  setCreatedRequestId(null);
                  setSelectedOrderResult(null);
                  setOffers([]);
                }}
                style={{ padding: '0.65rem 1.25rem', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}
              >
                + Новая заявка
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
