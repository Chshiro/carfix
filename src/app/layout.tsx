import type { Metadata } from 'next';
import React from 'react';
import './globals.css';
import 'leaflet/dist/leaflet.css';

export const metadata: Metadata = {
  title: 'CarFix — Скорая автомобильная помощь в Астане',
  description: 'Онлайн-маркетплейс выездной автомобильной помощи в Астане: автоэлектрика, прикурка, мелкий ремонт',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        {children}
      </body>
    </html>
  );
}

