import type { Metadata } from 'next';
import React from 'react';

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
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
