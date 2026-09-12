'use client';

import React, { useState, useEffect, useCallback } from 'react';
import CustomerWorkspace, { OrderResult } from '../components/CustomerWorkspace';
import ProviderWorkspace, { DEMO_PROVIDERS } from '../components/ProviderWorkspace';
import AdminWorkspace from '../components/AdminWorkspace';
import { ProviderPin } from '../components/AstanaMap';

const DEMO_CUSTOMER_USER_ID = 'c0000000-0000-0000-0000-000000000001';

export default function App() {
  const [activeTab, setActiveTab] = useState<'customer' | 'provider' | 'admin'>('customer');
  const [customerToken, setCustomerToken] = useState<string | null>(null);
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [selectedOrderResult, setSelectedOrderResult] = useState<OrderResult | null>(null);

  // Helper to fetch valid JWT token in demo mode
  const getDemoToken = useCallback(async (userId?: string, providerId?: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/demo-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, providerId }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        return data.data.token as string;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Initialize Customer demo token on mount
  useEffect(() => {
    getDemoToken(DEMO_CUSTOMER_USER_ID).then((token) => {
      if (token) setCustomerToken(token);
    });
  }, [getDemoToken]);

  // Seed provider pins for the interactive map in Astana
  const onlineProviderPins: ProviderPin[] = [
    {
      id: DEMO_PROVIDERS[0].id,
      name: DEMO_PROVIDERS[0].name,
      type: DEMO_PROVIDERS[0].type,
      lat: 51.1350,
      lng: 71.4280,
      rating: DEMO_PROVIDERS[0].rating,
    },
    {
      id: DEMO_PROVIDERS[1].id,
      name: DEMO_PROVIDERS[1].name,
      type: DEMO_PROVIDERS[1].type,
      lat: 51.1210,
      lng: 71.4390,
      rating: DEMO_PROVIDERS[1].rating,
    },
    {
      id: DEMO_PROVIDERS[2].id,
      name: DEMO_PROVIDERS[2].name,
      type: DEMO_PROVIDERS[2].type,
      lat: 51.1410,
      lng: 71.4150,
      rating: DEMO_PROVIDERS[2].rating,
    },
    {
      id: DEMO_PROVIDERS[3].id,
      name: DEMO_PROVIDERS[3].name,
      type: DEMO_PROVIDERS[3].type,
      lat: 51.1180,
      lng: 71.4100,
      rating: DEMO_PROVIDERS[3].rating,
    },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 1. TOP STICKY NAVBAR */}
      <header className="app-header">
        <div className="nav-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #10b981 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '1.2rem',
                color: '#ffffff',
                boxShadow: '0 0 15px rgba(59, 130, 246, 0.4)',
              }}
            >
              ⚡
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.02em', color: '#f8fafc' }}>
                  CarFix
                </span>
                <span className="badge badge-blue" style={{ fontSize: '0.65rem' }}>
                  Астана • Operations Ready
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Маркетплейс оперативной автопомощи
              </div>
            </div>
          </div>

          {/* Role Switcher Tabs */}
          <div className="role-tabs">
            <button
              onClick={() => setActiveTab('customer')}
              className={`tab-btn ${activeTab === 'customer' ? 'active' : ''}`}
            >
              🚗 Автомобилист
            </button>
            <button
              onClick={() => setActiveTab('provider')}
              className={`tab-btn ${activeTab === 'provider' ? 'active provider' : ''}`}
            >
              🔧 Мастер / СТО
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
              style={activeTab === 'admin' ? { background: '#ef4444', color: '#ffffff' } : {}}
            >
              🛡️ Ops (Admin)
            </button>
          </div>
        </div>
      </header>

      {/* 2. MAIN CONTENT AREA */}
      <main style={{ flex: 1, maxWidth: '960px', width: '100%', margin: '0 auto', padding: '1.5rem 1rem' }}>
        {activeTab === 'customer' ? (
          <CustomerWorkspace
            token={customerToken}
            createdRequestId={createdRequestId}
            setCreatedRequestId={setCreatedRequestId}
            selectedOrderResult={selectedOrderResult}
            setSelectedOrderResult={setSelectedOrderResult}
            onlineProviders={onlineProviderPins}
          />
        ) : activeTab === 'provider' ? (
          <ProviderWorkspace
            getDemoToken={getDemoToken}
            createdRequestId={createdRequestId}
            selectedOrderResult={selectedOrderResult}
            setSelectedOrderResult={setSelectedOrderResult}
          />
        ) : (
          <AdminWorkspace getDemoToken={getDemoToken} />
        )}
      </main>

      {/* 3. FOOTER */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '1.5rem 1rem',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          background: 'rgba(7, 9, 14, 0.6)',
        }}
      >
        <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>CarFix Astana © 2026. Real-Time Spatial Automotive Dispatch.</div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <span>PostGIS Geography 4326</span>
            <span>•</span>
            <span>JWT Auth</span>
            <span>•</span>
            <span>Atomic Row Locking</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
