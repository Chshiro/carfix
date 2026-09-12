'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { ProviderPin } from './AstanaMap';

const DynamicAstanaMap = dynamic(() => import('./AstanaMap'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: '420px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-card)',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="spinner" />
      <span style={{ marginLeft: '10px', color: 'var(--text-muted)' }}>Загрузка карты диспетчера...</span>
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
  const [selectedDispute, setSelectedDispute] = useState<DisputeItem | null>(null);

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

  // Update Provider Verification Level or Status
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
          blockReason: !currentBlocked ? 'Блокировка администратором за нарушение правил' : undefined,
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
        setSelectedDispute(null);
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
        return <span className="badge badge-green">Выполнен</span>;
      case 'IN_PROGRESS':
        return <span className="badge badge-blue">В работе</span>;
      case 'ARRIVED':
        return <span className="badge badge-yellow">Прибыл</span>;
      case 'EN_ROUTE':
        return <span className="badge badge-yellow">В пути</span>;
      case 'PROVIDER_SELECTED':
        return <span className="badge badge-yellow">Назначен</span>;
      case 'CANCELLED':
        return <span className="badge badge-red">Отменен</span>;
      default:
        return <span className="badge badge-gray">{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. TOP HEADER & METRICS */}
      <div
        className="card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          borderColor: 'rgba(239, 68, 68, 0.3)',
          background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.08) 0%, var(--bg-card) 100%)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.3rem', fontWeight: 900 }}>🛡️ CarFix Operations & Dispatch Center</span>
            <span className="badge badge-red">Astana Dispatch</span>
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Оперативное управление маркетплейсом, Live-радар мастеров, верификация ИИН и разрешение споров.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={loadDashboardData} className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>
            🔄 Обновить
          </button>
          <button
            onClick={handleRunSweep}
            className="btn-primary"
            style={{
              padding: '0.5rem 1rem',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              borderColor: '#f59e0b',
            }}
          >
            🧹 Sweep (Очистка)
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#10b981',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          {actionMessage}
        </div>
      )}

      {/* 2. METRICS CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Активные заявки</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-blue)', marginTop: '0.25rem' }}>
            {metrics ? metrics.activeRequestsCount : '...'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Радар поиска
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Мастера на линии</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-green)', marginTop: '0.25rem' }}>
            {metrics ? `${metrics.onlineProvidersCount} / ${metrics.totalProvidersCount}` : '...'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Готовы принять выезд
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Заказы в работе</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b', marginTop: '0.25rem' }}>
            {metrics ? metrics.activeOrdersCount : '...'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Выполняются сейчас
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Выручка маркетплейса (GMV)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', marginTop: '0.25rem' }}>
            {metrics ? `${Math.round(metrics.totalGmvTiyn / 100).toLocaleString('ru-RU')} ₸` : '...'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {metrics?.completedOrdersCount} завершенных заказов
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Открытые споры</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: disputes.length > 0 ? '#ef4444' : 'var(--text-muted)', marginTop: '0.25rem' }}>
            {disputes.filter((d) => d.status === 'OPEN').length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Требуют арбитража
          </div>
        </div>
      </div>

      {/* 3. SUB-NAVIGATION TABS */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveSubTab('map')}
          className={`tab-btn ${activeSubTab === 'map' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
        >
          🗺️ Карта Диспетчера ({dispatchOrders.length})
        </button>
        <button
          onClick={() => setActiveSubTab('orders')}
          className={`tab-btn ${activeSubTab === 'orders' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
        >
          📋 Активные Заказы ({orders.length})
        </button>
        <button
          onClick={() => setActiveSubTab('verification')}
          className={`tab-btn ${activeSubTab === 'verification' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
        >
          🔍 Верификация Мастеров ({providers.length})
        </button>
        <button
          onClick={() => setActiveSubTab('disputes')}
          className={`tab-btn ${activeSubTab === 'disputes' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', ...(disputes.some(d => d.status === 'OPEN') ? { borderColor: '#ef4444' } : {}) }}
        >
          ⚖️ Центр Споров ({disputes.length})
        </button>
      </div>

      {/* TAB 1: DISPATCH LIVE MAP */}
      {activeSubTab === 'map' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card" style={{ padding: '0.5rem' }}>
            <DynamicAstanaMap
              center={
                dispatchOrders[0]?.customer.location || { lat: 51.128, lng: 71.4305 }
              }
              radiusKm={15}
              providerPins={dispatchMapPins}
              readOnly={true}
            />
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1rem 0' }}>
              🔴 Live-статусы заказов на карте Астаны
            </h3>
            {dispatchOrders.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Нет активных заказов в режиме выезда прямо сейчас.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                {dispatchOrders.map((o) => (
                  <div
                    key={o.orderId}
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{o.category}</span>
                      {getStatusBadge(o.status)}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      👤 Клиент: <a href={`tel:${o.customer.phone}`} style={{ color: '#38bdf8' }}>{o.customer.phone}</a>
                    </div>
                    {o.provider && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        🔧 Мастер: {o.provider.businessName} ({o.provider.phone})
                      </div>
                    )}
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
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
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
              Список заказов ({filteredOrders.length})
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['ALL', 'ACTIVE', 'COMPLETED', 'CANCELLED'].map((f) => (
                <button
                  key={f}
                  onClick={() => setOrderFilter(f)}
                  className={`tab-btn ${orderFilter === f ? 'active' : ''}`}
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                >
                  {f === 'ALL' ? 'Все' : f === 'ACTIVE' ? 'Активные' : f === 'COMPLETED' ? 'Выполненные' : 'Отмененные'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Категория</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Клиент</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Исполнитель</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Сумма</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((ord) => (
                  <tr key={ord.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>{ord.category}</td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>{ord.customerPhone}</td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>{ord.providerBusinessName}</td>
                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700, color: '#10b981' }}>
                      {ord.finalAmountTiyn
                        ? `${Math.round(ord.finalAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                        : ord.agreedAmountTiyn
                        ? `${Math.round(ord.agreedAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                        : '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>{getStatusBadge(ord.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: MASTER VERIFICATION */}
      {activeSubTab === 'verification' && (
        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1rem 0' }}>
            Реестр мастеров и верификация ({providers.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {providers.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: '1rem',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
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
                    <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{p.businessName}</span>
                    <span className="badge badge-gray">{p.providerType}</span>
                    {p.isOnline ? (
                      <span className="badge badge-green">В сети</span>
                    ) : (
                      <span className="badge badge-gray">Оффлайн</span>
                    )}
                    {p.isBlocked && <span className="badge badge-red">Заблокирован</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    📞 {p.phone} • ⭐ {(p.rating / 100).toFixed(1)} ({p.completedJobs} заказов) • ИИН: {p.taxNumberIin || 'Не указан'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleVerifyMaster(p.id, 'VERIFIED')}
                    className="btn-secondary"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', color: '#10b981', borderColor: '#10b981' }}
                  >
                    ✓ Верифицировать
                  </button>
                  <button
                    onClick={() => handleToggleBlock(p.id, p.isBlocked)}
                    className="btn-secondary"
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.8rem',
                      color: p.isBlocked ? '#10b981' : '#ef4444',
                      borderColor: p.isBlocked ? '#10b981' : '#ef4444',
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

      {/* TAB 4: DISPUTE RESOLUTION */}
      {activeSubTab === 'disputes' && (
        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1rem 0' }}>
            Центр арбитража и претензий ({disputes.length})
          </h3>

          {disputes.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              🎉 Нет открытых споров или жалоб от клиентов и мастеров.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {disputes.map((d) => (
                <div
                  key={d.id}
                  style={{
                    padding: '1rem',
                    borderRadius: '10px',
                    background: d.status === 'OPEN' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${d.status === 'OPEN' ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-subtle)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                      Спор по заказу #{d.orderId.slice(0, 8)} ({d.category})
                    </div>
                    <span className={`badge ${d.status === 'OPEN' ? 'badge-red' : 'badge-green'}`}>
                      {d.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem' }}>
                    <strong>Причина:</strong> {d.reason}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Заявитель: {d.openedByPhone} • Мастер: {d.providerBusinessName}
                  </div>

                  {d.status === 'OPEN' && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleResolveDispute(d.id, 'RESOLVED_REFUND', undefined, 'Полный возврат средств клиенту')}
                        className="btn-primary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#3b82f6' }}
                      >
                        ↩️ Полный возврат клиенту
                      </button>
                      <button
                        onClick={() => handleResolveDispute(d.id, 'RESOLVED_RELEASE', undefined, 'Выплата мастеру в полном объеме')}
                        className="btn-primary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#10b981' }}
                      >
                        💵 Выплата мастеру
                      </button>
                      <button
                        onClick={() => handleResolveDispute(d.id, 'RESOLVED_SPLIT', undefined, 'Разделение 50/50')}
                        className="btn-secondary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      >
                        ⚖️ Разделить 50/50
                      </button>
                      <button
                        onClick={() => handleResolveDispute(d.id, 'DISMISSED', undefined, 'Претензия отклонена')}
                        className="btn-secondary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: '#94a3b8' }}
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
