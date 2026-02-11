# Range/Liquidation Bot (Bybit Linear USDT Perps)

> ⚠️ Не финансовый совет. Использование на реальном рынке на ваш риск.

## Быстрый старт (dev)

### Вариант для Windows (одним кликом)
1. Скопируйте `.env.example` в `.env` (если нужен кастомный конфиг).
2. Запустите `run-dev.bat` из корня репозитория.
3. Скрипт автоматически:
   - проверит `backend/node_modules` и выполнит `npm i` в `backend`, если зависимостей нет;
   - проверит `frontend/node_modules` и выполнит `npm i` в `frontend`, если зависимостей нет;
   - откроет два окна: backend (`npm run dev`) и frontend (`npm run dev`).

### Кроссплатформенный вариант через npm
1. Скопируйте `.env.example` в `.env`.
2. `npm --prefix backend install`
3. `npm --prefix frontend install`
4. `npm run dev`
5. Откройте `http://localhost:5173`.

## Dev-порты и proxy
- Фронтенд **не подключается к Bybit напрямую**: браузер открывает только WS-RPC `/ws` на backend.
- Подключения к Bybit WebSocket (`stream.bybit.com` и аналоги) существуют только в backend (`backend/src/bybit/publicWs.js`, `backend/src/bybit/privateTradeWs.js`).
- Backend в dev по умолчанию слушает `PORT=3000`.
- Vite dev server слушает `5173`.
- WebSocket path: `WS_PATH=/ws` (по умолчанию).
- В dev фронтенд ходит по same-origin URL (например `ws://localhost:5173/ws`), а Vite проксирует `/ws` на backend (`http://${VITE_BACKEND_HOST|127.0.0.1}:${VITE_BACKEND_PORT|3000}`) с `ws: true`.

## Production
1. `npm run build`
2. `npm start`
3. Backend отдает frontend build и WS-RPC на одном origin.

В production WebSocket клиент формирует URL только из текущего origin и `WS_PATH` (`/ws`), без хардкода `localhost`.

## Приёмочные проверки
1. **Windows / run-dev.bat**
   - двойной клик по `run-dev.bat`;
   - если `node_modules` отсутствуют, зависимости ставятся автоматически;
   - открываются два окна: backend и frontend.
2. **DEV / устойчивый WS**
   - UI подключается к WS без спама ошибок `WebSocket is already in CLOSING or CLOSED state`;
   - при остановке backend клиент уходит в reconnect c backoff;
   - при повторном запуске backend клиент восстанавливает соединение автоматически.
3. **PROD / same-origin**
   - `npm run build`;
   - `npm start`;
   - UI доступен по `/`;
   - WS подключается по same-origin path `/ws`.

## TRADING_MODE
- `paper`: симуляция заявок и позиций (без реальных ордеров).
- `demo`: торговля через Bybit REST private endpoints.
- `real`: торговля через Bybit Trade WebSocket (REST fallback).

## Ключевые safety-gates
- Если `ENABLE_TRADING != 1` — фактическая торговля блокируется, используется paper gateway.
- Если `BYBIT_ENV=mainnet` и `BYBIT_ALLOW_MAINNET != 1` — реальная торговля запрещена.
- Стратегия использует только `category=linear`.
- У ордеров уникальные `orderLinkId`.
- Есть RPC `emergencyStop` (остановка входов, отмена ордеров, опциональное закрытие позиций).

## Основные параметры стратегии
- Universe: `minTurnover24hUSDT`, `minATRPct15m`, `maxSymbols`, `tradeOnlyCrab`.
- Signals: `liqThreshUSDT`, `volZThresh`, `cvdLookbackBars`.
- Risk/Execution: `entrySplitPct`, `addMovePct`, `slPctDefault`, `tp1Pct`, `tp2Pct`, `tp1ClosePct`, `beBufferBps`, `maxHoldHoursAlt`, `maxHoldHoursBtc`.

## Архитектура
- `backend/`: express + ws rpc + bot engine + gateways (paper/rest/ws).
- `frontend/`: Vite + React + Router + Bootstrap (dashboard/config/symbols/positions/logs).
- `data/`: config/logs/state.
