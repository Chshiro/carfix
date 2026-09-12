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
  const providerMarkersRef = useRef<any[]>([]);

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
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(map);

        // Click on map to reposition customer marker
        if (!readOnly && onLocationChange) {
          map.on('click', (e: any) => {
            const newCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
            onLocationChange(newCoords, `Координаты: ${newCoords.lat.toFixed(4)}, ${newCoords.lng.toFixed(4)}`);
          });
        }

        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;

      // Customer Marker Icon
      const customerIcon = L.divIcon({
        className: 'custom-pulse-marker',
        html: '<div class="pulse-pin"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
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

      // Update or create Radius Circle
      if (circleRef.current) {
        circleRef.current.setLatLng([center.lat, center.lng]);
        circleRef.current.setRadius(radiusKm * 1000);
      } else {
        circleRef.current = L.circle([center.lat, center.lng], {
          radius: radiusKm * 1000,
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.12,
          weight: 2,
          dashArray: '6, 6',
        }).addTo(map);
      }

      // Clear existing provider pins
      providerMarkersRef.current.forEach((m) => m.remove());
      providerMarkersRef.current = [];

      // Add Provider pins
      providerPins.forEach((p) => {
        const providerIcon = L.divIcon({
          className: 'provider-marker',
          html: `<div style="background:#10b981;border:2px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 0 10px #10b981;"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });

        const pMarker = L.marker([p.lat, p.lng], { icon: providerIcon })
          .bindPopup(`<strong>${p.name}</strong><br/>${p.type}<br/>⭐ ${p.rating.toFixed(1)}`)
          .addTo(map);

        providerMarkersRef.current.push(pMarker);
      });
    }

    initMap();

    return () => {
      isMounted = false;
    };
  }, [center.lat, center.lng, radiusKm, providerPins, readOnly, onLocationChange]);

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '340px', borderRadius: '12px' }} />
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          background: 'rgba(7, 9, 14, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          padding: '4px 10px',
          fontSize: '0.75rem',
          color: '#94a3b8',
          zIndex: 400,
          display: 'flex',
          gap: '12px',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', background: '#3b82f6', borderRadius: '50%' }}></span>
          Место поломки
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%' }}></span>
          Мастера в онлайне
        </span>
        <span>Радиус: {radiusKm} км</span>
      </div>
    </div>
  );
}
