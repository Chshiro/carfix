# CARFIX — UX AUDIT

**Date:** 2026-09-09  
**Status:** Pre-Implementation (no UI to audit — reviewing planned UX)

---

## Current State

No UI exists. No wireframes. No design system. No components. This audit evaluates the planned UX from the product documents.

---

## 1. Customer Request Creation UX

### Current plan (PRODUCT.md)

6 steps before publishing:
1. Select category
2. Select/confirm vehicle
3. Describe problem
4. Add photos
5. Confirm location
6. Select service type

### Problem

**Too many steps for an urgent scenario.** User's car won't start. They're stressed, possibly cold, possibly in the dark. They do NOT want to fill out a form.

### Recommended flow

```
SCREEN 1: "Что случилось?" (What happened?)
→ Large, tappable category cards with icons
→ Single tap selects category

SCREEN 2: "Где вы?" (Where are you?)
→ Auto-detect GPS
→ Map shows pin
→ "Подтвердить" (Confirm) button
→ If GPS fails: manual address entry

→ REQUEST PUBLISHED ← (2 taps from launch!)

OPTIONAL ENRICHMENT (shown while waiting for offers):
→ "Добавить детали" (Add details)
→ Description text field
→ Photo upload
→ Vehicle selection (or quick-add)
```

**Key principle:** Minimum viable request = category + location. Everything else is optional enrichment.

### Service type selection

The original plan has a separate step for "Provider comes to me" / "I go to provider" / "Need towing."

**Simplification:** For the MVP emergency wedge, assume `PROVIDER_COMES`. This is the default for "car won't start." Only show service type selection for non-emergency categories (planned maintenance, body repair — which are Phase 2+).

---

## 2. Provider Request Card UX

### Requirements

Provider must understand a request in <5 seconds. They're probably driving or working when the notification arrives.

### Recommended card format

```
┌─────────────────────────────────────┐
│ 🔴 НОВАЯ ЗАЯВКА                     │
│                                      │
│ 🚗 Toyota Camry 2018                │
│                                      │
│ ⚡ Не заводится / электрика          │
│    "Стартер щёлкает, не заводится"  │
│                                      │
│ 📍 3.2 км от вас • Сарыарка         │
│ ⏱ Срочно                            │
│                                      │
│ 📸 2 фото                           │
│                                      │
│ ┌────────────┐  ┌────────────────┐  │
│ │   МОГУ ✓   │  │  НЕ МОГУ ✗    │  │
│ └────────────┘  └────────────────┘  │
└─────────────────────────────────────┘
```

### Critical elements

| Element | Why | Priority |
|---------|-----|----------|
| Distance | Provider needs to know if it's worth the trip | Must have |
| Category + description | Provider needs to know what tools to bring | Must have |
| Vehicle make/model/year | Different cars have different common issues | Should have |
| Photos | Helps provider assess the situation | Nice to have |
| "МОГУ" button | One-tap to start offer creation | Must have |
| Urgency indicator | Helps provider prioritize | Should have |

---

## 3. Offer Creation UX (Provider)

### Keep it fast

Provider taps "МОГУ" → offer form:

```
┌──────────────────────────────────────┐
│ ВАШЕ ПРЕДЛОЖЕНИЕ                      │
│                                       │
│ Цена:                                 │
│ ┌─────────┐                           │
│ │ ₸       │  ← number input           │
│ └─────────┘                           │
│                                       │
│ Тип цены:                             │
│ ⊙ Фиксированная                      │
│ ○ После осмотра (ориентировочная)     │
│ ○ Диапазон                            │
│                                       │
│ Буду через:                           │
│ ┌────────┐                            │
│ │ 15 мин │  ← slider or number        │
│ └────────┘                            │
│                                       │
│ Комментарий: (необязательно)          │
│ ┌─────────────────────────────────┐   │
│ │                                 │   │
│ └─────────────────────────────────┘   │
│                                       │
│ ┌──────────────────────────────────┐  │
│ │      ОТПРАВИТЬ ПРЕДЛОЖЕНИЕ       │  │
│ └──────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### Target: <30 seconds to submit an offer

If it takes longer, provider abandons it and goes back to their current work.

---

## 4. Offer Comparison UX (Customer)

### The most important screen in the product

This is where the marketplace delivers value. The customer must be able to compare offers at a glance.

### Recommended offer card

```
┌──────────────────────────────────────┐
│  👤 Руслан А.                        │
│  ⭐ 4.8 (23 заказа)                 │
│  ✓ Проверенный мастер                │
│                                       │
│  💰 8 000 ₸  Фиксированная цена     │
│  ⏱ ~15 мин   📍 2.3 км              │
│                                       │
│  "Скорее всего стартер, возьму       │
│   с собой запасной"                  │
│                                       │
│  ┌──────────────────────────────────┐│
│  │      ВЫБРАТЬ МАСТЕРА             ││
│  └──────────────────────────────────┘│
└──────────────────────────────────────┘
```

### Sort controls

```
[По цене ↑] [По времени ↑] [По рейтингу ↓]
```

### Must distinguish pricing models visually

| Model | Display |
|-------|---------|
| Fixed | `8 000 ₸` (green text — certainty) |
| After inspection | `~8 000 ₸ (после осмотра)` (yellow text — estimate) |
| Range | `6 000 – 10 000 ₸` (yellow text — range) |

---

## 5. Waiting Screen UX

After publishing a request, the customer sees:

```
┌──────────────────────────────────────┐
│  ⏳ Ищем мастеров...                 │
│                                       │
│  Уведомлено: 8 мастеров              │
│  Радиус поиска: 5 км                 │
│                                       │
│  ┌──────────────────────────────────┐│
│  │     [animated search pulse]      ││
│  │          on map                   ││
│  └──────────────────────────────────┘│
│                                       │
│  Предложения появятся здесь ↓        │
│                                       │
│  ─────────────────────────────────── │
│  Пока нет предложений                │
│  ─────────────────────────────────── │
│                                       │
│  [Отменить заявку]                   │
└──────────────────────────────────────┘
```

When an offer arrives:
```
┌──────────────────────────────────────┐
│  ✅ 1 предложение!                    │
│                                       │
│  [Offer card - Руслан А.]            │
│                                       │
│  Ждём ещё предложения...             │
│  Вы можете выбрать в любой момент    │
└──────────────────────────────────────┘
```

### Critical: Never fake activity

If no providers are found within the radius, do NOT show a spinning animation for 10 minutes. Show:

```
😕 Рядом нет доступных мастеров

Мы расширяем поиск до 10 км...

Или попробуйте:
• [Позвонить автоэлектрику из 2GIS]
• [Попробовать позже]
```

**Honest failure is better than false hope.**

---

## 6. Order Progress UX

Both parties need to see the current status clearly:

```
Customer view:                Provider view:
                              
✅ Заявка создана              ✅ Заявка принята
✅ Предложение принято          ✅ Предложение принято  
🔵 Мастер в пути (15 мин)     🔵 [Я на месте →]
○ Мастер на месте              ○ Мастер на месте
○ Работа начата                ○ [Начал работу →]
○ Работа завершена             ○ [Завершил →]

📞 +7 7XX XXX XX XX            📞 +7 7XX XXX XX XX
   Руслан А.                      Алихан К.
```

---

## 7. Missing UX Considerations

| Element | Status | Impact |
|---------|--------|--------|
| Empty states (no requests, no offers, no history) | Not designed | High — first-time users will see these |
| Loading states | Not designed | Medium — prevents confusion during API calls |
| Error states (network error, server error) | Not designed | High — must be clear and actionable |
| Notification permission prompt | Not designed | Critical — without this, no push notifications |
| PWA install prompt | Not designed | Medium — improves return engagement |
| Onboarding flow (first-time motorist) | Not designed | Medium — reduces first-use friction |
| Provider onboarding (profile setup wizard) | Not designed | High — provider must complete profile to go online |
| Map interaction | Not designed | Medium — pin adjustment, zoom, accuracy indicator |
| Image upload progress | Not designed | Medium — user needs feedback during upload |
| Offline indicator | Not designed | Medium — show when connection is lost |

---

## 8. UX Friction Assessment

| Journey Step | Current Friction | Acceptable? | Fix |
|-------------|-----------------|-------------|-----|
| Registration (phone + OTP) | Low | ✅ | Standard flow |
| Vehicle registration | Medium (before request) | ❌ | Make optional, allow during wait |
| Category selection | Low (if well-designed) | ✅ | Visual cards, not dropdown |
| Location | Low (GPS auto-detect) | ✅ | Manual fallback needed |
| Request creation total | 6 steps | ❌ | Reduce to 2 mandatory steps |
| Provider profile setup | Medium (many fields) | ⚠️ | Wizard with progress indicator |
| Provider offer creation | Low-Medium | ✅ | Pre-fill defaults where possible |
| Offer comparison | Low | ✅ | Cards with sorting |
| Offer acceptance | Low | ✅ | Single tap + confirmation |
| Rating | Low | ✅ | Stars + optional text |

---

## 9. Mobile-First Priorities

All designs must work on 360px width screens (common budget Android phones in Kazakhstan).

| Rule | Reason |
|------|--------|
| Min tap target: 44x44 px | Fingers, not cursors |
| One primary action per screen | Clarity under stress |
| No horizontal scrolling | Confusion |
| Large, readable text (16px base) | Readability outdoors / in poor lighting |
| High-contrast colors | Sunlight readability |
| Minimal text input | Typing on phone is slow |
| Pull-to-refresh everywhere | User expectation |
| Haptic feedback on key actions | Confirmation |
