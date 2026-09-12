'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { ProviderPin } from './AstanaMap';

const DynamicAstanaMap = dynamic(() => import('./AstanaMap'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: '380px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#111C33',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="spinner" />
      <span style={{ marginLeft: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Загрузка карты диспетчера...</span>
    </div>
  ),
});

const DEMO_ADMIN_USER_ID = 'e0000000-0000-0000-0000-000000000001';

export interface AdminMetrics {
  activeRequestsCount: number;
  activeOrdersCount: number;
  completedOrdersCount: number;
  totalGmvTiyn: number;
  onlineProvidersCount: number;
  totalProvidersCount: number;
  totalCustomersCount: number;
  openDisputesCount?: number;
}

export interface AdminProviderItem {
  id: string;
  userId: string;
  businessName: string;
  providerType: string;
  verificationLevel: string;
  verificationStatus: string;
  idCardNumber?: string | null;
  taxNumberIin?: string | null;
  rating: number;
  completedJobs: number;
  isOnline: boolean;
  isBlocked: boolean;
  blockReason?: string | null;
  phone: string;
  capabilities: string[];
}

export interface AdminOrderItem {
  id: string;
  requestId: string;
  status: string;
  agreedPricingMode: string;
  agreedAmountTiyn: number | null;
  finalAmountTiyn: number | null;
  category: string;
  customerPhone: string;
  providerBusinessName: string;
  createdAt: string;
  updatedAt: string;
}

export interface LiveDispatchMapItem {
  orderId: string;
  requestId: string;
  status: string;
  category: string;
  customer: {
    id: string;
    phone: string;
    location: { lat: number; lng: number };
  };
  provider: {
    id: string;
    businessName: string;
    phone: string;
    location: { lat: number; lng: number } | null;
    isOnline: boolean;
  } | null;
  agreedAmountTiyn: number | null;
  createdAt: string;
}

export interface DisputeItem {
  id: string;
  orderId: string;
  openedByUserId: string;
  openedByPhone: string;
  reason: string;
  status: string;
  resolutionNotes: string | null;
  refundAmountTiyn: number | null;
  adminId: string | null;
  category: string;
  providerBusinessName: string;
  orderStatus: string;
  createdAt: string;
  resolvedAt: string | null;
}

interface AdminWorkspaceProps {
  getDemoToken: (userId?: string, providerId?: string) => Promise<string | null>;
}

export default function AdminWorkspace({ getDemoToken }: AdminWorkspaceProps) {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'map' | 'orders' | 'verification' | 'disputes'>('map');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [providers, setProviders] = useState<AdminProviderItem[]>([]);
  const [orders, setOrders] = useState<AdminOrderItem[]>([]);
  const [dispatchOrders, setDispatchOrders] = useState<LiveDispatchMapItem[]>([]);
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<string>('ALL');

  // 1. Authenticate Admin
  useEffect(() => {
    getDemoToken(DEMO_ADMIN_USER_ID).then((token) => {
      if (token) {
        setAdminToken(token);
      }
    });
  }, [getDemoToken]);

  // 2. Fetch all admin data
  const loadDashboardData = useCallback(async () => {
    if (!adminToken) return;
    setIsLoading(true);
    try {
      const headers = { Authorization: `Bearer ${adminToken}` };

      const [metricsRes, providersRes, ordersRes, dispatchRes, disputesRes] = await Promise.all([
        fetch('/api/admin/metrics', { headers }),
        fetch('/api/admin/providers', { headers }),
        fetch('/api/admin/orders', { headers }),
        fetch('/api/admin/dispatch/map', { headers }),
        fetch('/api/admin/disputes', { headers }),
      ]);

      if (metricsRes.ok) {
        const json = await metricsRes.json();
        setMetrics(json.data);
      }

      if (providersRes.ok) {
        const json = await providersRes.json();
        setProviders(json.data);
      }

      if (ordersRes.ok) {
        const json = await ordersRes.json();
        setOrders(json.data);
      }

      if (dispatchRes.ok) {
        const json = await dispatchRes.json();
        setDispatchOrders(json.data.activeOrders || []);
      }

      if (disputesRes.ok) {
        const json = await disputesRes.json();
        setDisputes(json.data || []);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    if (adminToken) {
      loadDashboardData();
      const interval = setInterval(loadDashboardData, 8000);
      return () => clearInterval(interval);
    }
  }, [adminToken, loadDashboardData]);

  // Update Provider Verification
  const handleVerifyMaster = async (
    providerId: string,
    verificationStatus: 'VERIFIED' | 'REJECTED' | 'PENDING',
    verificationLevel?: 'LEVEL_1_VERIFIED_SERVICE' | 'LEVEL_2_VERIFIED_MASTER' | 'LEVEL_3_NEW_PROVIDER'
  ) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/masters/${providerId}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          verificationStatus,
          verificationLevel: verificationLevel || (verificationStatus === 'VERIFIED' ? 'LEVEL_2_VERIFIED_MASTER' : undefined),
        }),
      });
      if (res.ok) {
        setActionMessage(
          verificationStatus === 'VERIFIED'
            ? '✅ Мастер успешно верифицирован!'
            : '❌ Заявка на верификацию отклонена'
        );
        setTimeout(() => setActionMessage(null), 4000);
        loadDashboardData();
      }
    } catch (err) {
      console.error('Failed to update verification:', err);
    }
  };

  // Toggle Provider Block
  const handleToggleBlock = async (providerId: string, currentBlocked: boolean) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/masters/${providerId}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          isBlocked: !currentBlocked,
          blockReason: !currentBlocked ? 'Блокировка администратором за нарушение регламента' : undefined,
        }),
      });
      if (res.ok) {
        setActionMessage(
          currentBlocked ? 'Мастер успешно разблокирован' : 'Мастер временно заблокирован'
        );
        setTimeout(() => setActionMessage(null), 4000);
        loadDashboardData();
      }
    } catch (err) {
      console.error('Failed to toggle block status:', err);
    }
  };

  // Resolve Dispute
  const handleResolveDispute = async (
    disputeId: string,
    resolution: 'RESOLVED_REFUND' | 'RESOLVED_RELEASE' | 'RESOLVED_SPLIT' | 'DISMISSED',
    refundAmountTiyn?: number,
    notes?: string
  ) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/disputes/${disputeId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ resolution, refundAmountTiyn, notes }),
      });
      if (res.ok) {
        setActionMessage(`⚖️ Спор успешно разрешен: ${resolution}`);
        setTimeout(() => setActionMessage(null), 4000);
        loadDashboardData();
      }
    } catch (err) {
      console.error('Failed to resolve dispute:', err);
    }
  };

  // Trigger Maintenance Sweep
  const handleRunSweep = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/maintenance/sweep', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(
          `🧹 Очистка выполнена: расширено: ${data.data.expandedRequestsCount}, истекло: ${data.data.expiredRequestsCount}, оффлайн: ${data.data.autoOfflinedProvidersCount}`
        );
        setTimeout(() => setActionMessage(null), 5000);
        loadDashboardData();
      }
    } catch (err) {
      console.error('Failed to run sweep:', err);
    }
  };

  const filteredOrders =
    orderFilter === 'ALL'
      ? orders
      : orderFilter === 'ACTIVE'
      ? orders.filter((o) =>
          ['PROVIDER_SELECTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(o.status)
        )
      : orders.filter((o) => o.status === orderFilter);

  // Pins for Dispatch Map
  const dispatchMapPins: ProviderPin[] = providers
    .filter((p) => p.isOnline)
    .map((p, idx) => ({
      id: p.id,
      name: `${p.businessName} (${p.verificationLevel})`,
      type: p.providerType,
      lat: 51.128 + (idx % 3) * 0.015 - (idx % 2) * 0.01,
      lng: 71.425 + (idx % 4) * 0.012 - (idx % 2) * 0.008,
      rating: p.rating,
    }));

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="badge badge-emerald">✓ Выполнен</span>;
      case 'IN_PROGRESS':
        return <span className="badge badge-aquamarine">⚡ В работе</span>;
      case 'ARRIVED':
        return <span className="badge badge-blue">📍 На месте</span>;
      case 'EN_ROUTE':
        return <span className="badge badge-blue">🚗 В пути</span>;
      case 'PROVIDER_SELECTED':
        return <span className="badge badge-indigo">Назначен</span>;
      case 'CANCELLED':
        return <span className="badge badge-red">✕ Отменен</span>;
      default:
        return <span className="badge badge-gray">{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* 1. TOP HEADER & OPERATIONS BANNER */}
      <div
        className="glass-card"
        style={{
          padding: '1.75rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.25rem',
          border: '1px solid var(--indigo-light)',
          background: 'linear-gradient(135deg, rgba(67, 56, 202, 0.2) 0%, #111C33 100%)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#FFFFFF' }}>
              🛡️ CarFix Operations & Dispatch Center
            </h2>
            <span className="badge badge-indigo">Астана Live</span>
          </div>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Оперативный мониторинг выездов, диспетчеризация карты Астаны, проверка ИИН и арбитраж споров.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={loadDashboardData} className="btn btn-secondary" style={{ padding: '0.65rem 1.15rem' }}>
            🔄 Обновить
          </button>
          <button
            onClick={handleRunSweep}
            className="btn btn-primary"
            style={{ padding: '0.65rem 1.25rem' }}
          >
            🧹 Sweep (Очистка)
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(6, 182, 212, 0.15)',
            border: '1px solid var(--aquamarine)',
            color: 'var(--aquamarine-bright)',
            fontSize: '1rem',
            fontWeight: 700,
          }}
        >
          {actionMessage}
        </div>
      )}

      {/* 2. METRICS OVERVIEW CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.15rem' }}>
        <div className="glass-card" style={{ padding: '1.35rem', background: '#111C33' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Активные заявки</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--aquamarine-bright)', marginTop: '0.35rem' }}>
            {metrics ? metrics.activeRequestsCount : '...'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Радар поиска мастеров
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.35rem', background: '#111C33' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Мастера на линии</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#10B981', marginTop: '0.35rem' }}>
            {metrics ? `${metrics.onlineProvidersCount} / ${metrics.totalProvidersCount}` : '...'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Готовы принять выезд
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.35rem', background: '#111C33' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Заказы в работе</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--amber)', marginTop: '0.35rem' }}>
            {metrics ? metrics.activeOrdersCount : '...'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Выполняются прямо сейчас
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.35rem', background: '#111C33' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Выручка маркетплейса (GMV)</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#10B981', marginTop: '0.35rem' }}>
            {metrics ? `${Math.round(metrics.totalGmvTiyn / 100).toLocaleString('ru-RU')} ₸` : '...'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {metrics?.completedOrdersCount} завершенных заказов
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.35rem', background: '#111C33' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Открытые споры</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: disputes.length > 0 ? '#F43F5E' : 'var(--text-muted)', marginTop: '0.35rem' }}>
            {disputes.filter((d) => d.status === 'OPEN').length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Требуют арбитража
          </div>
        </div>
      </div>

      {/* 3. SUB-NAVIGATION TABS */}
      <div style={{ display: 'flex', gap: '0.65rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.65rem', overflowX: 'auto' }}>
        <button
          onClick={() => setActiveSubTab('map')}
          className={`tab-btn ${activeSubTab === 'map' ? 'active' : ''}`}
        >
          🗺️ Карта Диспетчера ({dispatchOrders.length})
        </button>
        <button
          onClick={() => setActiveSubTab('orders')}
          className={`tab-btn ${activeSubTab === 'orders' ? 'active' : ''}`}
        >
          📋 Реестр Заказов ({orders.length})
        </button>
        <button
          onClick={() => setActiveSubTab('verification')}
          className={`tab-btn ${activeSubTab === 'verification' ? 'active' : ''}`}
        >
          🔍 Верификация Мастеров ({providers.length})
        </button>
        <button
          onClick={() => setActiveSubTab('disputes')}
          className={`tab-btn ${activeSubTab === 'disputes' ? 'active' : ''}`}
          style={disputes.some((d) => d.status === 'OPEN') ? { borderColor: '#F43F5E', color: '#FDA4AF' } : {}}
        >
          ⚖️ Центр Споров ({disputes.length})
        </button>
      </div>

      {/* TAB 1: DISPATCH LIVE MAP */}
      {activeSubTab === 'map' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <DynamicAstanaMap
              center={
                dispatchOrders[0]?.customer.location || { lat: 51.128, lng: 71.4305 }
              }
              radiusKm={15}
              providerPins={dispatchMapPins}
              readOnly={true}
            />
          </div>

          <div className="glass-card" style={{ padding: '1.75rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 1.25rem 0', color: '#FFFFFF' }}>
              🔴 Live-статусы заказов на карте Астаны
            </h3>
            {dispatchOrders.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Нет активных заказов в режиме выезда прямо сейчас.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                {dispatchOrders.map((o) => (
                  <div
                    key={o.orderId}
                    style={{
                      padding: '1.15rem',
                      borderRadius: 'var(--radius-md)',
                      background: '#111C33',
                      border: '1px solid var(--border-card)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: '#FFFFFF' }}>{o.category}</span>
                      {getStatusBadge(o.status)}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      👤 Клиент: <a href={`tel:${o.customer.phone}`} style={{ color: 'var(--aquamarine-bright)', textDecoration: 'none' }}>{o.customer.phone}</a>
                    </div>
                    {o.provider && (
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        🔧 Мастер: {o.provider.businessName} ({o.provider.phone})
                      </div>
                    )}
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#10B981', marginTop: '0.35rem' }}>
                      {o.agreedAmountTiyn ? `${Math.round(o.agreedAmountTiyn / 100).toLocaleString('ru-RU')} ₸` : 'По согласованию'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ACTIVE ORDERS TABLE */}
      {activeSubTab === 'orders' && (
        <div className="glass-card" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
              Список заказов ({filteredOrders.length})
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['ALL', 'ACTIVE', 'COMPLETED', 'CANCELLED'].map((f) => (
                <button
                  key={f}
                  onClick={() => setOrderFilter(f)}
                  className={`tab-btn ${orderFilter === f ? 'active' : ''}`}
                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.85rem' }}
                >
                  {f === 'ALL' ? 'Все' : f === 'ACTIVE' ? 'Активные' : f === 'COMPLETED' ? 'Выполненные' : 'Отмененные'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 0.65rem' }}>Категория</th>
                  <th style={{ padding: '0.75rem 0.65rem' }}>Клиент</th>
                  <th style={{ padding: '0.75rem 0.65rem' }}>Исполнитель</th>
                  <th style={{ padding: '0.75rem 0.65rem' }}>Сумма</th>
                  <th style={{ padding: '0.75rem 0.65rem' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((ord) => (
                  <tr key={ord.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '0.85rem 0.65rem', fontWeight: 700, color: '#FFFFFF' }}>{ord.category}</td>
                    <td style={{ padding: '0.85rem 0.65rem' }}>{ord.customerPhone}</td>
                    <td style={{ padding: '0.85rem 0.65rem' }}>{ord.providerBusinessName}</td>
                    <td style={{ padding: '0.85rem 0.65rem', fontWeight: 900, color: '#10B981' }}>
                      {ord.finalAmountTiyn
                        ? `${Math.round(ord.finalAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                        : ord.agreedAmountTiyn
                        ? `${Math.round(ord.agreedAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                        : '—'}
                    </td>
                    <td style={{ padding: '0.85rem 0.65rem' }}>{getStatusBadge(ord.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: MASTER VERIFICATION */}
      {activeSubTab === 'verification' && (
        <div className="glass-card" style={{ padding: '1.75rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 1.25rem 0', color: '#FFFFFF' }}>
            Реестр мастеров и верификация ИИН ({providers.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {providers.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-md)',
                  background: '#111C33',
                  border: '1px solid var(--border-card)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#FFFFFF' }}>{p.businessName}</span>
                    <span className="badge badge-blue">{p.providerType}</span>
                    {p.isOnline ? (
                      <span className="badge badge-emerald">В сети</span>
                    ) : (
                      <span className="badge badge-gray">Оффлайн</span>
                    )}
                    {p.isBlocked && <span className="badge badge-red">Заблокирован</span>}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                    📞 {p.phone} &bull; ⭐ {(p.rating / 100).toFixed(1)} ({p.completedJobs} заказов) &bull; ИИН: {p.taxNumberIin || 'Не указан'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.65rem' }}>
                  <button
                    onClick={() => handleVerifyMaster(p.id, 'VERIFIED')}
                    className="btn btn-secondary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: '#10B981', borderColor: '#10B981' }}
                  >
                    ✓ Верифицировать
                  </button>
                  <button
                    onClick={() => handleToggleBlock(p.id, p.isBlocked)}
                    className="btn btn-secondary"
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.85rem',
                      color: p.isBlocked ? '#10B981' : '#F43F5E',
                      borderColor: p.isBlocked ? '#10B981' : '#F43F5E',
                    }}
                  >
                    {p.isBlocked ? 'Разблокировать' : 'Заблокировать'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: DISPUTE ARBITRATION */}
      {activeSubTab === 'disputes' && (
        <div className="glass-card" style={{ padding: '1.75rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 1.25rem 0', color: '#FFFFFF' }}>
            Центр арбитража и споров ({disputes.length})
          </h3>

          {disputes.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              🎉 Нет открытых споров или жалоб от клиентов и мастеров.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              {disputes.map((d) => (
                <div
                  key={d.id}
                  style={{
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    background: d.status === 'OPEN' ? 'rgba(244, 63, 94, 0.1)' : '#111C33',
                    border: `1px solid ${d.status === 'OPEN' ? 'rgba(244, 63, 94, 0.4)' : 'var(--border-card)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#FFFFFF' }}>
                      Спор по заказу #{d.orderId.slice(0, 8)} ({d.category})
                    </div>
                    <span className={`badge ${d.status === 'OPEN' ? 'badge-red' : 'badge-emerald'}`}>
                      {d.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    <strong>Причина:</strong> {d.reason}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Заявитель: {d.openedByPhone} &bull; Мастер: {d.providerBusinessName}
                  </div>

                  {d.status === 'OPEN' && (
                    <div style={{ display: 'flex', gap: '0.65rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleResolveDispute(d.id, 'RESOLVED_REFUND', undefined, 'Полный возврат средств клиенту')}
                        className="btn btn-primary"
                        style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
                      >
                        ↩️ Полный возврат клиенту
                      </button>
                      <button
                        onClick={() => handleResolveDispute(d.id, 'RESOLVED_RELEASE', undefined, 'Выплата мастеру в полном объеме')}
                        className="btn btn-aquamarine"
                        style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
                      >
                        💵 Выплата мастеру
                      </button>
                      <button
                        onClick={() => handleResolveDispute(d.id, 'RESOLVED_SPLIT', undefined, 'Разделение 50/50')}
                        className="btn btn-secondary"
                        style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
                      >
                        ⚖️ Разделить 50/50
                      </button>
                      <button
                        onClick={() => handleResolveDispute(d.id, 'DISMISSED', undefined, 'Претензия отклонена')}
                        className="btn btn-secondary"
                        style={{ padding: '0.55rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}
                      >
                        Отклонить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
