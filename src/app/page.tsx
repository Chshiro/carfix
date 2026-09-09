import React from 'react';

export default function HomePage() {
  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>CarFix — Сервис скорой автопомощи</h1>
      <p>Астана, Казахстан</p>
      <div style={{ marginTop: '1rem', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
        <h3>Канонические категории запуска:</h3>
        <ul>
          <li><strong>Автоэлектрика и запуск:</strong> компьютерная диагностика, стартер, генератор</li>
          <li><strong>Аккумулятор и прикурка:</strong> 12V/24V, замена АКБ на месте</li>
          <li><strong>Мелкий выездной ремонт:</strong> ремни, патрубки, свечи, жидкости</li>
        </ul>
      </div>
    </main>
  );
}
