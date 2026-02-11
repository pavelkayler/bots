import WebSocket from 'ws';

const URLS = {
  demo: 'wss://stream.bybit.com/v5/public/linear',
  testnet: 'wss://stream-testnet.bybit.com/v5/public/linear',
  mainnet: 'wss://stream.bybit.com/v5/public/linear'
};

const HEARTBEAT_INTERVAL_MS = 20_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

export class BybitPublicWs {
  constructor(env, logger) {
    this.env = env;
    this.logger = logger;
    this.ws = null;
    this.subscriptions = new Set();
    this.handlers = new Set();
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
  }

  connect() {
    if (this.ws || this.reconnectTimer) return;
    const url = URLS[this.env.BYBIT_ENV];
    this.ws = new WebSocket(url);
    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.logger.info({ url }, 'Public WS connected');
      this.startHeartbeat();
      if (this.subscriptions.size) this.subscribe([...this.subscriptions]);
    });
    this.ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (error) {
        this.logger.warn({ message: error.message }, 'Public WS message parse error');
        return;
      }
      for (const handler of this.handlers) handler(msg);
    });
    this.ws.on('close', () => {
      this.stopHeartbeat();
      this.logger.warn('Public WS closed');
      this.ws = null;
      this.scheduleReconnect();
    });
    this.ws.on('error', (error) => {
      this.logger.warn({ message: error.message }, 'Public WS error');
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    const attempt = this.reconnectAttempts + 1;
    const baseDelay = Math.min(RECONNECT_BASE_DELAY_MS * (2 ** this.reconnectAttempts), RECONNECT_MAX_DELAY_MS);
    const jitter = Math.floor(Math.random() * 300);
    const delay = baseDelay + jitter;
    this.reconnectAttempts = attempt;
    this.logger.warn({ attempt, delayMs: delay }, 'Public WS reconnect scheduled');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  onMessage(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  subscribe(topics) {
    topics.forEach((t) => this.subscriptions.add(t));
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: 'subscribe', args: topics }));
    }
  }

  unsubscribe(topics) {
    topics.forEach((t) => this.subscriptions.delete(t));
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: 'unsubscribe', args: topics }));
    }
  }
}
