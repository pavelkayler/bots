import { EventEmitter } from 'node:events';
import { selectUniverse } from './universe.js';
import { calcFeatures } from './features.js';
import { detectRegime } from './regime.js';
import { evaluateCandidate } from './fsm.js';
import { buildRiskChecks } from './risk.js';
import { normalizePrice, normalizeQty } from '../utils/math.js';

const PRICE_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

export class RangeBot extends EventEmitter {
  constructor({ env, logger, configStore, restClient, publicWs, instrumentsCache, gateway, orderManager }) {
    super();
    this.env = env;
    this.logger = logger;
    this.configStore = configStore;
    this.restClient = restClient;
    this.publicWs = publicWs;
    this.instrumentsCache = instrumentsCache;
    this.gateway = gateway;
    this.orderManager = orderManager;

    this.running = false;
    this.universe = [];
    this.candidates = [];
    this.market = new Map();
    this.lastSignalTime = null;
    this.lastDecisionTime = null;
    this.symbolCatalog = [];
    this.lastDecisionExplain = {
      canTrade: false,
      reasonsBlocked: ['botStopped'],
      candidatesTop: [],
      lastSignal: null,
      sizing: null,
      mode: this.configStore.get().mode || this.env.TRADING_MODE,
      gates: {
        enableTrading: this.env.ENABLE_TRADING,
        bybitEnv: this.env.BYBIT_ENV
      }
    };

    this.publicWs.onMessage((msg) => this.onPublicMessage(msg));
    if (this.gateway.on) {
      this.gateway.on('execution', (payload) => this.emitEvent('execution', payload));
      this.gateway.on('fill', (payload) => this.emitEvent('execution', payload));
    }
  }

  emitEvent(kind, payload) {
    this.emit('event', { type: 'event', topic: 'rangeMetrics', payload: { kind, ...payload, ts: Date.now() } });
  }

  publishPrices() {
    const prices = {};
    for (const symbol of PRICE_SYMBOLS) {
      const row = this.market.get(symbol);
      prices[symbol] = row?.lastPrice || null;
    }
    this.emit('event', { type: 'event', topic: 'marketPrices', payload: { kind: 'prices', prices, ts: Date.now() } });
  }

  async start() {
    if (this.running) return;
    this.running = true;
    await this.instrumentsCache.refresh();
    this.symbolCatalog = [...this.instrumentsCache.map.keys()].sort();
    this.publicWs.connect();
    await this.refreshUniverse();
    this.publishStatus();
    this.loop = setInterval(() => this.tick().catch((e) => this.emitEvent('error', { message: e.message })), 5000);
    this.universeLoop = setInterval(() => this.refreshUniverse().catch((e) => this.logger.warn({ message: e.message }, 'Universe refresh failed')), 15 * 60 * 1000);
    this.pricesLoop = setInterval(() => this.publishPrices(), 500);
    this.emitEvent('log', { message: 'Bot started and cycle initialized' });
  }

  stop() {
    this.running = false;
    clearInterval(this.loop);
    clearInterval(this.universeLoop);
    clearInterval(this.pricesLoop);
    this.lastDecisionExplain = {
      ...this.lastDecisionExplain,
      canTrade: false,
      reasonsBlocked: ['botStopped'],
      lastDecisionTime: Date.now()
    };
    this.publishStatus();
  }

  async emergencyStop(closePositions = false) {
    this.stop();
    const result = await this.gateway.emergencyStop(closePositions);
    this.emitEvent('log', { message: 'Emergency stop executed', result });
    return result;
  }

  publishStatus() {
    this.emitEvent('status', this.getStatus());
    this.emitEvent('explain', this.getDecisionExplain());
  }

  async refreshUniverse() {
    const config = this.configStore.get();
    const selectedSymbol = String(config.symbol || '').trim().toUpperCase();
    if (selectedSymbol) {
      this.universe = [selectedSymbol];
    } else {
      this.universe = await selectUniverse(this.restClient, config);
    }
    const topics = [];
    for (const s of new Set([...this.universe, ...PRICE_SYMBOLS])) {
      topics.push(`tickers.${s}`);
      topics.push(`publicTrade.${s}`);
      topics.push(`kline.5.${s}`);
      topics.push(`kline.15.${s}`);
      topics.push(`kline.60.${s}`);
      topics.push(`allLiquidation.${s}`);
    }
    this.publicWs.subscribe(topics);
    this.publishStatus();
  }

  onPublicMessage(msg) {
    const topic = msg.topic || '';
    if (!topic || !msg.data) return;
    if (topic.startsWith('tickers.')) {
      const symbol = topic.split('.')[1];
      const prev = this.market.get(symbol) || { volumes: [] };
      const t = Array.isArray(msg.data) ? msg.data[0] : msg.data;
      this.market.set(symbol, {
        ...prev,
        symbol,
        lastPrice: Number(t.lastPrice || t.markPrice || prev.lastPrice || 0),
        nearSupport: Math.random() < 0.1,
        nearResistance: Math.random() < 0.1,
        atrPct15m: Number(t.price24hPcnt || 0) * 100
      });
      if (PRICE_SYMBOLS.includes(symbol)) this.publishPrices();
      if (this.env.TRADING_MODE === 'paper') this.gateway.onTick(symbol, Number(t.lastPrice || 0));
    }
    if (topic.startsWith('publicTrade.')) {
      const symbol = topic.split('.')[1];
      const prev = this.market.get(symbol) || { volumes: [] };
      const trades = Array.isArray(msg.data) ? msg.data : [msg.data];
      let delta = prev.cvdSlope || 0;
      for (const tr of trades) {
        const qty = Number(tr.v || tr.size || 0);
        prev.volumes = [...(prev.volumes || []).slice(-80), qty];
        delta += tr.S === 'Buy' ? qty : -qty;
      }
      this.market.set(symbol, { ...prev, cvdSlope: delta });
    }
    if (topic.startsWith('allLiquidation.')) {
      const symbol = topic.split('.')[1];
      const prev = this.market.get(symbol) || { volumes: [] };
      const liqs = Array.isArray(msg.data) ? msg.data : [msg.data];
      let liqLong15m = prev.liqLong15m || 0;
      let liqShort15m = prev.liqShort15m || 0;
      for (const liq of liqs) {
        const value = Number(liq.v || liq.value || 0) * Number(liq.p || liq.price || 0);
        if (liq.S === 'Buy') liqShort15m += value;
        else liqLong15m += value;
      }
      this.market.set(symbol, { ...prev, liqLong15m, liqShort15m });
    }

    if (topic.startsWith('kline.')) {
      const [, interval, symbol] = topic.split('.');
      if (!interval || !symbol) return;
      const prev = this.market.get(symbol) || { volumes: [] };
      const candle = Array.isArray(msg.data) ? msg.data[0] : msg.data;
      const source = candle || {};
      const high = Number(source.high ?? source.h ?? 0);
      const low = Number(source.low ?? source.l ?? 0);
      const current = Number(source.close ?? source.c ?? source.lastPrice ?? prev.lastPrice ?? 0);
      this.market.set(symbol, {
        ...prev,
        kline: {
          ...(prev.kline || {}),
          [interval]: { high, low, current, ts: Date.now() }
        }
      });
    }
  }

  async tick() {
    if (!this.running) return;
    const config = this.configStore.get();
    const regime = detectRegime([{ close: 1 }, { close: 1.01 }, { close: 1.02 }, { close: 1.01 }]);
    const risk = buildRiskChecks(this.env, config);
    this.candidates = [];

    const reasonsBlocked = [];
    if (this.env.ENABLE_TRADING !== '1') reasonsBlocked.push('ENABLE_TRADING=0');
    if (!risk.canEnter) reasonsBlocked.push('risk.canEnter=false');

    let lastSignal = null;
    let sizing = null;

    for (const symbol of this.universe) {
      const state = this.market.get(symbol);
      if (!state?.lastPrice) {
        reasonsBlocked.push(`noMarketData:${symbol}`);
        continue;
      }
      const features = calcFeatures(state);
      const candidate = evaluateCandidate(symbol, features, config);
      if (!candidate) continue;
      this.candidates.push(candidate);
      lastSignal = { symbol, side: candidate.side, why: candidate.why || 'candidateMatched' };
      this.lastSignalTime = Date.now();
      this.emitEvent('plan', { symbol, candidate, regime, risk });
      if (this.running && risk.canEnter && (!config.tradeOnlyCrab || regime.regime === 'CRAB')) {
        const result = await this.executeCandidate(candidate, state.lastPrice, config);
        sizing = result?.sizing || sizing;
        if (!result?.ok && result?.reason) reasonsBlocked.push(result.reason);
      } else if (config.tradeOnlyCrab && regime.regime !== 'CRAB') {
        reasonsBlocked.push(`regime=${regime.regime}`);
      }
    }

    if (!this.candidates.length) reasonsBlocked.push('noCandidates');

    this.lastDecisionTime = Date.now();
    this.lastDecisionExplain = {
      canTrade: reasonsBlocked.length === 0,
      reasonsBlocked: [...new Set(reasonsBlocked)],
      candidatesTop: this.candidates.slice(0, 5).map((c) => ({ symbol: c.symbol, side: c.side, score: c.score ?? null })),
      lastSignal,
      sizing,
      lastDecisionTime: this.lastDecisionTime,
      mode: config.mode || this.env.TRADING_MODE,
      gates: {
        enableTrading: this.env.ENABLE_TRADING,
        bybitEnv: this.env.BYBIT_ENV,
        canEnter: risk.canEnter
      }
    };

    this.emitEvent('candidates', { candidates: this.candidates });
    this.publishStatus();
  }

  async executeCandidate(candidate, lastPrice, config) {
    const instrument = this.instrumentsCache.get(candidate.symbol);
    const qty = normalizeQty(1, instrument);
    const price = normalizePrice(lastPrice, instrument);
    const sizing = {
      notional: Number((qty * price).toFixed(6)),
      qty,
      minQty: instrument.minQty,
      qtyStep: instrument.qtyStep
    };

    if (!qty || qty < instrument.minQty) {
      return { ok: false, reason: `qtyTooSmall:${candidate.symbol}`, sizing };
    }

    const orderLinkId = this.orderManager.createOrderLinkId(candidate.symbol, candidate.side, 'entry1');

    try {
      await this.gateway.placeOrder({ symbol: candidate.symbol, side: candidate.side, type: 'Market', qty, price, orderLinkId }, lastPrice);

      const stopSide = candidate.side === 'Buy' ? 'Sell' : 'Buy';
      const slPrice = candidate.side === 'Buy' ? price * (1 - config.slPctDefault / 100) : price * (1 + config.slPctDefault / 100);
      await this.gateway.placeOrder({
        symbol: candidate.symbol,
        side: stopSide,
        type: 'Stop',
        qty,
        stopPrice: normalizePrice(slPrice, instrument),
        reduceOnly: true,
        orderLinkId: this.orderManager.createOrderLinkId(candidate.symbol, stopSide, 'sl')
      }, lastPrice);
      return { ok: true, sizing };
    } catch (error) {
      this.logger.error({ message: error.message, symbol: candidate.symbol }, 'Order placement failed');
      this.emitEvent('error', { message: `orderPlacementFailed:${candidate.symbol}:${error.message}` });
      return { ok: false, reason: `executionError:${error.message}`, sizing };
    }
  }

  getStatus() {
    const config = this.configStore.get();
    const positionsValue = this.gateway.getPositions ? this.gateway.getPositions() : [];
    const positionsCount = Array.isArray(positionsValue) ? positionsValue.length : 0;
    return {
      running: this.running,
      tradingMode: config.mode || this.env.TRADING_MODE,
      enableTrading: this.env.ENABLE_TRADING,
      bybitEnv: this.env.BYBIT_ENV,
      symbol: config.symbol || 'auto',
      symbols: this.universe.length,
      candidates: this.candidates.length,
      candidatesCount: this.candidates.length,
      positions: positionsCount,
      lastSignalTime: this.lastSignalTime,
      lastDecisionTime: this.lastDecisionTime,
      gates: this.lastDecisionExplain.gates,
      canTrade: this.lastDecisionExplain.canTrade,
      reasonsBlocked: this.lastDecisionExplain.reasonsBlocked
    };
  }

  getDecisionExplain() {
    return this.lastDecisionExplain;
  }

  getUniverse() {
    return this.universe;
  }

  getCandidates() {
    return this.candidates;
  }

  async getAvailableSymbols() {
    if (!this.symbolCatalog.length) {
      await this.instrumentsCache.refresh();
      this.symbolCatalog = [...this.instrumentsCache.map.keys()].sort();
    }
    return this.symbolCatalog;
  }

  getMarketSnapshot(symbol) {
    const target = String(symbol || this.universe[0] || '').toUpperCase();
    const row = this.market.get(target) || {};
    return {
      symbol: target,
      current: row.lastPrice || null,
      timeframes: {
        m5: row.kline?.['5'] || null,
        m15: row.kline?.['15'] || null,
        h1: row.kline?.['60'] || null
      }
    };
  }
}
