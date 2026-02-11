import WebSocket from 'ws';
import crypto from 'node:crypto';

const URLS = {
  demo: 'wss://stream-demo.bybit.com/v5/trade',
  testnet: 'wss://stream-testnet.bybit.com/v5/trade',
  mainnet: 'wss://stream.bybit.com/v5/trade'
};

const HEARTBEAT_INTERVAL_MS = 20_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

export class BybitPrivateTradeWs {
  constructor(env, logger) {
    this.env = env;
    this.logger = logger;
    this.ws = null;
    this.connected = false;
    this.handlers = new Set();
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.demoUnsupportedWarned = false;
  }

  connect() {
    if (this.env.BYBIT_ENV === 'demo') {
      if (!this.demoUnsupportedWarned) {
        this.logger.warn('Trade WS disabled: Bybit demo does not support v5 trade websocket, using REST fallback');
        this.demoUnsupportedWarned = true;
      }
      this.connected = false;
      return;
    }
    if (this.ws || this.reconnectTimer) return;
    const url = URLS[this.env.BYBIT_ENV];
    this.ws = new WebSocket(url);
    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.logger.info({ url }, 'Trade WS connected');
      this.startHeartbeat();
      const expires = Date.now() + 10000;
      const signature = crypto.createHmac('sha256', this.env.BYBIT_API_SECRET).update(`GET/realtime${expires}`).digest('hex');
      this.ws.send(JSON.stringify({ op: 'auth', args: [this.env.BYBIT_API_KEY, expires, signature] }));
    });
    this.ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (error) {
        this.logger.warn({ message: error.message }, 'Trade WS message parse error');
        return;
      }
      if (msg.op === 'auth' && msg.success) {
        this.connected = true;
        this.logger.info('Trade WS authenticated');
      }
      for (const h of this.handlers) h(msg);
    });
    this.ws.on('close', () => {
      this.stopHeartbeat();
      this.connected = false;
      this.ws = null;
      this.logger.warn('Trade WS closed');
      this.scheduleReconnect();
    });
    this.ws.on('error', (error) => {
      this.connected = false;
      this.logger.warn({ message: error.message }, 'Trade WS error');
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
    if (this.reconnectTimer || this.env.BYBIT_ENV === 'demo') return;
    const attempt = this.reconnectAttempts + 1;
    const baseDelay = Math.min(RECONNECT_BASE_DELAY_MS * (2 ** this.reconnectAttempts), RECONNECT_MAX_DELAY_MS);
    const jitter = Math.floor(Math.random() * 300);
    const delay = baseDelay + jitter;
    this.reconnectAttempts = attempt;
    this.logger.warn({ attempt, delayMs: delay }, 'Trade WS reconnect scheduled');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  onMessage(handler) {
    this.handlers.add(handler);
  }

  send(message) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }
}
