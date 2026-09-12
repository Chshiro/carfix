'use client';

import React, { useState, useEffect, useCallback } from 'react';
const DEMO_ADMIN_USER_ID = 'e0000000-0000-0000-0000-000000000001';

export interface AdminMetrics {
  activeRequestsCount: number;
  activeOrdersCount: number;
  completedOrdersCount: number;
  totalGmvTiyn: number;
  onlineProvidersCount: number;
  totalProvidersCount: number;
  totalCustomersCount: number;
}

export interface AdminProviderItem {
  id: string;
  userId: string;
  businessName: string;
  providerType: string;
  verificationLevel: string;
  rating: number;
  completedJobs: number;
  isOnline: boolean;
  isBlocked: boolean;
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

interface AdminWorkspaceProps {
  getDemoToken: (userId?: string, providerId?: string) => Promise<string | null>;
}

export default function AdminWorkspace({ getDemoToken }: AdminWorkspaceProps) {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [providers, setProviders] = useState<AdminProviderItem[]>([]);
  const [orders, setOrders] = useState<AdminOrderItem[]>([]);
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

      const [metricsRes, providersRes, ordersRes] = await Promise.all([
        fetch('/api/admin/metrics', { headers }),
        fetch('/api/admin/providers', { headers }),
        fetch('/api/admin/orders', { headers }),
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
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    if (adminToken) {
      loadDashboardData();
    }
  }, [adminToken, loadDashboardData]);

  // Update Provider Verification Level
  const handleUpdateVerification = async (
    providerId: string,
    verificationLevel: 'LEVEL_1_VERIFIED_SERVICE' | 'LEVEL_2_VERIFIED_MASTER' | 'LEVEL_3_NEW_PROVIDER'
  ) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ verificationLevel }),
      });
      if (res.ok) {
        setActionMessage(`Уровень мастера успешно обновлен на ${verificationLevel}`);
        setTimeout(() => setActionMessage(null), 4000);
        loadDashboardData();
      }
    } catch (err) {
      console.error('Failed to update verification level:', err);
    }
  };

  // Toggle Provider Block
  const handleToggleBlock = async (providerId: string, currentBlocked: boolean) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ isBlocked: !currentBlocked }),
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
          `🧹 Очистка выполнена: расширено заявок: ${data.data.expandedRequestsCount}, истекло: ${data.data.expiredRequestsCount}, оффлайн: ${data.data.autoOfflinedProvidersCount}`
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

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'LEVEL_1_VERIFIED_SERVICE':
        return <span className="badge badge-green">★ Level 1 (Проверенный СТО)</span>;
      case 'LEVEL_2_VERIFIED_MASTER':
        return <span className="badge badge-blue">✓ Level 2 (Проверенный мастер)</span>;
      default:
        return <span className="badge badge-gray">Level 3 (Новый)</span>;
    }
  };

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
      {/* 1. TOP CONTROLS & ACTIONS */}
      <div
        className="card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          borderColor: 'rgba(239, 68, 68, 0.3)',
          background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.05) 0%, var(--bg-card) 100%)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>🛡️ Центр управления CarFix (Ops)</span>
            <span className="badge badge-red">Admin Mode</span>
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Мониторинг маркетплейса в г. Астана, верификация партнеров и контроль исполнения заказов.
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Активные заявки</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-blue)', marginTop: '0.25rem' }}>
            {metrics ? metrics.activeRequestsCount : '...'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Поиск исполнителей
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Мастера онлайн</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-green)', marginTop: '0.25rem' }}>
            {metrics ? `${metrics.onlineProvidersCount} / ${metrics.totalProvidersCount}` : '...'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Готовы принять выезд
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Заказы в исполнении</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b', marginTop: '0.25rem' }}>
            {metrics ? metrics.activeOrdersCount : '...'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            В пути / В работе
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Выполнено GMV</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.25rem' }}>
            {metrics ? `${(metrics.totalGmvTiyn / 100).toLocaleString('ru-RU')} ₸` : '...'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Завершенных заказов: {metrics?.completedOrdersCount ?? 0}
          </div>
        </div>
      </div>

      {/* 3. PROVIDER VERIFICATION QUEUE */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
            👥 Очередь верификации и статус мастеров ({providers.length})
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Астана, Казахстан</span>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            Загрузка списка мастеров...
          </div>
        ) : providers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            Мастера не найдены
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {providers.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: '1rem',
                  borderRadius: '10px',
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${p.isBlocked ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-subtle)'}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>{p.businessName}</span>
                    {getLevelBadge(p.verificationLevel)}
                    {p.isOnline ? (
                      <span className="badge badge-green">Онлайн</span>
                    ) : (
                      <span className="badge badge-gray">Оффлайн</span>
                    )}
                    {p.isBlocked && <span className="badge badge-red">ЗАБЛОКИРОВАН</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    📞 {p.phone} • Тип: {p.providerType} • Рейтинг: {(p.rating / 100).toFixed(1)} ★ • Выполнено: {p.completedJobs} заказов
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                    {p.capabilities.map((c) => (
                      <span
                        key={c}
                        style={{
                          fontSize: '0.7rem',
                          background: 'rgba(255,255,255,0.05)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleUpdateVerification(p.id, 'LEVEL_1_VERIFIED_SERVICE')}
                    className="btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
                    title="Присвоить Level 1 (Проверенное СТО)"
                  >
                    ★ L1
                  </button>
                  <button
                    onClick={() => handleUpdateVerification(p.id, 'LEVEL_2_VERIFIED_MASTER')}
                    className="btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
                    title="Присвоить Level 2 (Проверенный мастер)"
                  >
                    ✓ L2
                  </button>
                  <button
                    onClick={() => handleUpdateVerification(p.id, 'LEVEL_3_NEW_PROVIDER')}
                    className="btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
                    title="Сбросить на Level 3 (Новый)"
                  >
                    L3
                  </button>
                  <button
                    onClick={() => handleToggleBlock(p.id, p.isBlocked)}
                    className="btn-danger"
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
                  >
                    {p.isBlocked ? 'Разблокировать' : 'Блок'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. LIVE ORDERS MONITOR */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
            🛰️ Мониторинг исполнения заказов ({filteredOrders.length})
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setOrderFilter('ALL')}
              className={`btn-secondary ${orderFilter === 'ALL' ? 'active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
            >
              Все
            </button>
            <button
              onClick={() => setOrderFilter('ACTIVE')}
              className={`btn-secondary ${orderFilter === 'ACTIVE' ? 'active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
            >
              В процессе
            </button>
            <button
              onClick={() => setOrderFilter('COMPLETED')}
              className={`btn-secondary ${orderFilter === 'COMPLETED' ? 'active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
            >
              Завершены
            </button>
          </div>
        </div>

        {orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            Активных или завершенных заказов пока нет
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredOrders.map((o) => (
              <div
                key={o.id}
                style={{
                  padding: '1rem',
                  borderRadius: '10px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700 }}>Заказ #{o.id.substring(0, 8)}</span>
                    {getStatusBadge(o.status)}
                    <span className="badge badge-gray">{o.category}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Клиент: {o.customerPhone} • Исполнитель: {o.providerBusinessName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Создан: {new Date(o.createdAt).toLocaleString('ru-RU')}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--accent-green)' }}>
                    {o.finalAmountTiyn
                      ? `${(o.finalAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                      : o.agreedAmountTiyn
                      ? `${(o.agreedAmountTiyn / 100).toLocaleString('ru-RU')} ₸`
                      : 'По договоренности'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Режим: {o.agreedPricingMode}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
