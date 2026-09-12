'use client';

import React, { useEffect, useRef } from 'react';

export interface MapCoords {
  lat: number;
  lng: number;
}

export interface ProviderPin {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  rating: number;
}

interface AstanaMapProps {
  center: MapCoords;
  radiusKm?: number;
  onLocationChange?: (coords: MapCoords, name: string) => void;
  providerPins?: ProviderPin[];
  readOnly?: boolean;
}

export const ASTANA_LANDMARKS = [
  { name: 'Монумент Байтерек (Левый берег)', lat: 51.1283, lng: 71.4305 },
  { name: 'ТРЦ Хан Шатыр', lat: 51.1324, lng: 71.4037 },
  { name: 'EXPO / Mega Silk Way', lat: 51.0898, lng: 71.4172 },
  { name: 'Вокзал Нұрлы Жол (Астана-1)', lat: 51.1965, lng: 71.4191 },
  { name: 'Набережная / Правый берег', lat: 51.1605, lng: 71.4258 },
];

export default function AstanaMap({
  center,
  radiusKm = 5,
  onLocationChange,
  providerPins = [],
  readOnly = false,
}: AstanaMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const providerMarkersRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapContainerRef.current) return;
      
      const L = (await import('leaflet')).default;

      if (!isMounted) return;

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [center.lat, center.lng],
          zoom: 12,
          zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors &bull; CarFix Astana',
          maxZoom: 18,
        }).addTo(map);

        // Reposition customer marker on map click
        if (!readOnly && onLocationChange) {
          map.on('click', (e: any) => {
            const newCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
            onLocationChange(newCoords, `Координаты: ${newCoords.lat.toFixed(4)}, ${newCoords.lng.toFixed(4)}`);
          });
        }

        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;

      // Customer Marker Icon (Pulsing Aquamarine with Car icon)
      const customerIcon = L.divIcon({
        className: 'custom-customer-pin',
        html: `
          <div class="customer-pin-pulse">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
              <circle cx="7" cy="17" r="2"/>
              <path d="M9 17h6"/>
              <circle cx="17" cy="17" r="2"/>
            </svg>
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });

      // Update or create Customer Marker
      if (markerRef.current) {
        markerRef.current.setLatLng([center.lat, center.lng]);
      } else {
        markerRef.current = L.marker([center.lat, center.lng], {
          icon: customerIcon,
          draggable: !readOnly,
        }).addTo(map);

        if (!readOnly && onLocationChange) {
          markerRef.current.on('dragend', (e: any) => {
            const pos = e.target.getLatLng();
            onLocationChange({ lat: pos.lat, lng: pos.lng }, `Координаты: ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`);
          });
        }
      }

      // Update or create Radius Circle with subtle aquamarine/indigo glow
      if (circleRef.current) {
        circleRef.current.setLatLng([center.lat, center.lng]);
        circleRef.current.setRadius(radiusKm * 1000);
      } else {
        circleRef.current = L.circle([center.lat, center.lng], {
          radius: radiusKm * 1000,
          color: '#06B6D4',
          fillColor: '#06B6D4',
          fillOpacity: 0.08,
          weight: 2,
          dashArray: '8, 8',
        }).addTo(map);
      }

      // Diff provider pins to prevent popup disruption & memory churn
      const existingMap = providerMarkersRef.current;
      const currentIds = new Set(providerPins.map((p) => p.id));

      // Remove pins that disappeared
      for (const [id, marker] of existingMap.entries()) {
        if (!currentIds.has(id)) {
          marker.remove();
          existingMap.delete(id);
        }
      }

      // Add or update Provider pins
      providerPins.forEach((p) => {
        const existing = existingMap.get(p.id);
        if (existing) {
          existing.setLatLng([p.lat, p.lng]);
        } else {
          const providerIcon = L.divIcon({
            className: 'provider-pin-wrap',
            html: `
              <div class="provider-pin-badge" title="${p.name}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });

          const pMarker = L.marker([p.lat, p.lng], { icon: providerIcon })
            .bindPopup(`
              <div style="font-family:'Plus Jakarta Sans',sans-serif; color:#0A0F1D; min-width:140px; padding:2px;">
                <strong style="font-size:14px; color:#1E293B;">${p.name}</strong><br/>
                <span style="font-size:12px; color:#475569;">${p.type}</span><br/>
                <span style="display:inline-block; margin-top:4px; font-weight:700; color:#2563EB; font-size:13px;">⭐ ${(p.rating > 50 ? p.rating / 100 : p.rating).toFixed(1)}</span>
              </div>
            `)
            .addTo(map);

          existingMap.set(p.id, pMarker);
        }
      });
    }

    initMap();

    const providerMarkers = providerMarkersRef.current;

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
        providerMarkers.clear();
      }
    };
  }, [center.lat, center.lng, radiusKm, providerPins, readOnly, onLocationChange]);

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '380px', borderRadius: '16px' }} />
      <div
        style={{
          position: 'absolute',
          bottom: '14px',
          left: '14px',
          background: 'rgba(10, 15, 29, 0.9)',
          backdropFilter: 'blur(10px)',
          border: '1px solid #192642',
          borderRadius: '10px',
          padding: '6px 14px',
          fontSize: '0.85rem',
          color: '#E2E8F0',
          fontWeight: 600,
          zIndex: 400,
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', background: '#06B6D4', borderRadius: '50%', boxShadow: '0 0 8px #06B6D4' }}></span>
          Место поломки
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', background: '#2563EB', borderRadius: '50%', boxShadow: '0 0 8px #2563EB' }}></span>
          Мастера онлайн ({providerPins.length})
        </span>
        <span style={{ color: '#94A3B8' }}>Радиус: {radiusKm} км</span>
      </div>
    </div>
  );
}
