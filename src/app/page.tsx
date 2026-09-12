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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '1.4rem',
                color: '#FFFFFF',
                boxShadow: '0 0 20px var(--aquamarine-glow)',
              }}
            >
              ⚡
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{ fontWeight: 900, fontSize: '1.35rem', letterSpacing: '-0.02em', color: '#FFFFFF' }}>
                  CarFix
                </span>
                <span className="badge badge-aquamarine" style={{ fontSize: '0.75rem' }}>
                  Астана &bull; Live Dispatch
                </span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Платформа оперативной автопомощи
              </div>
            </div>
          </div>

          {/* Role Switcher Tabs */}
          <div className="role-tabs">
            <button
              onClick={() => setActiveTab('customer')}
              className={`tab-btn ${activeTab === 'customer' ? 'active' : ''}`}
            >
              🚗 Водитель (SOS)
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
              style={activeTab === 'admin' ? { background: '#4338CA', color: '#FFFFFF', boxShadow: '0 4px 18px var(--indigo-glow)' } : {}}
            >
              🛡️ Диспетчер (Admin)
            </button>
          </div>
        </div>
      </header>

      {/* 2. MAIN CONTENT CONTAINER */}
      <main style={{ flex: 1, maxWidth: '1080px', width: '100%', margin: '0 auto', padding: '2rem 1.25rem' }}>
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
          padding: '1.75rem 1.25rem',
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
          background: '#0A0F1D',
          marginTop: 'auto',
        }}
      >
        <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ color: 'var(--text-secondary)' }}>
            CarFix Astana &copy; 2026. Human-Centric Real-Time Automotive Dispatch & Escrow Platform.
          </div>
          <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-muted)' }}>
            <span>PostGIS SRID 4326</span>
            <span>&bull;</span>
            <span>Kaspi Pay QR Escrow</span>
            <span>&bull;</span>
            <span>Web Push & PWA</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
