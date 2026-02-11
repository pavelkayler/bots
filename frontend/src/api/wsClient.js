const OPEN = WebSocket.OPEN;
const CONNECTING = WebSocket.CONNECTING;
const CLOSING = WebSocket.CLOSING;
const CLOSED = WebSocket.CLOSED;

export class WsRpcClient {
  constructor(path = import.meta.env.VITE_WS_PATH || '/ws') {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    this.url = `${protocol}://${window.location.host}${normalizedPath}`;
    this.path = normalizedPath;
    this.id = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.queue = [];

    this.ws = null;
    this.connectPromise = null;
    this.reconnectTimer = null;
    this.manualClose = false;
    this.reconnectAttempts = 0;

    this.maxQueueSize = 250;
    this.maxReconnectDelayMs = 30000;
    this.maxReconnectAttempts = 20;
  }

  connect() {
    console.debug('[WsRpcClient] connect() called', { url: this.url });
    if (this.manualClose) this.manualClose = false;

    if (this.ws && (this.ws.readyState === CONNECTING || this.ws.readyState === OPEN)) {
      return this.connectPromise || Promise.resolve();
    }

    if (this.ws && this.ws.readyState === CLOSING) {
      return this.connectPromise || Promise.resolve();
    }

    this.clearReconnectTimer();

    this.connectPromise = new Promise((resolve, reject) => {
      try {
        console.debug('[WsRpcClient] opening websocket', this.url);
        this.ws = new WebSocket(this.url);
      } catch (error) {
        this.connectPromise = null;
        this.scheduleReconnect('connect_error');
        reject(error);
        return;
      }

      let isSettled = false;
      this.ws.onopen = () => {
        console.debug('[WsRpcClient] websocket opened');
        this.reconnectAttempts = 0;
        this.flushQueue();
        if (!isSettled) {
          isSettled = true;
          resolve();
        }
      };

      this.ws.onmessage = (event) => {
        console.debug('[WsRpcClient] message received', event.data);
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === 'response') {
          const holder = this.pending.get(msg.id);
          if (!holder) return;
          this.pending.delete(msg.id);
          if (msg.ok) holder.resolve(msg.result);
          else holder.reject(new Error(msg.error || 'RPC error'));
          return;
        }

        if (msg.type === 'event') {
          for (const cb of this.listeners) cb(msg);
        }
      };

      this.ws.onerror = () => {
        console.error('[WsRpcClient] websocket error');
        if (!isSettled) {
          isSettled = true;
          reject(new Error(`WS connection failed for path ${this.path}`));
        }
      };

      this.ws.onclose = () => {
        console.warn('[WsRpcClient] websocket closed');
        this.connectPromise = null;
        this.ws = null;
        if (!this.manualClose) {
          this.scheduleReconnect('close');
        }
      };
    });

    return this.connectPromise;
  }

  onEvent(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  call(method, params = {}) {
    console.debug('[WsRpcClient] RPC call', { method, params });
    return new Promise((resolve, reject) => {
      const id = this.id++;
      const payload = { type: 'request', id, method, params };
      this.pending.set(id, { resolve, reject });
      this.send(payload, id);
    });
  }

  send(payload, pendingId) {
    const serialized = JSON.stringify(payload);

    if (this.ws && this.ws.readyState === OPEN) {
      console.debug('[WsRpcClient] sending payload immediately');
      this.ws.send(serialized);
      return;
    }

    if (this.ws && this.ws.readyState === CONNECTING) {
      this.enqueue(serialized, pendingId);
      return;
    }

    if (this.ws && this.ws.readyState === CLOSING) {
      this.enqueue(serialized, pendingId);
      return;
    }

    this.enqueue(serialized, pendingId);
    this.connect().catch(() => {
      // reconnect is scheduled in onclose/onerror
    });
  }

  enqueue(serialized, pendingId) {
    if (this.queue.length >= this.maxQueueSize) {
      const dropped = this.queue.shift();
      if (dropped?.pendingId && this.pending.has(dropped.pendingId)) {
        const holder = this.pending.get(dropped.pendingId);
        this.pending.delete(dropped.pendingId);
        holder.reject(new Error('WS queue overflow; request dropped'));
      }
    }
    this.queue.push({ serialized, pendingId });
    console.debug('[WsRpcClient] queued payload', { queueSize: this.queue.length });
  }

  flushQueue() {
    if (!this.ws || this.ws.readyState !== OPEN || this.queue.length === 0) return;
    const queued = this.queue;
    this.queue = [];
    for (const item of queued) {
      if (!this.ws || this.ws.readyState !== OPEN) {
        this.queue.unshift(item);
        return;
      }
      this.ws.send(item.serialized);
      console.debug('[WsRpcClient] flushed queued payload');
    }
  }

  scheduleReconnect(reason) {
    if (this.manualClose || this.reconnectTimer || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    const baseDelay = Math.min(1000 * (2 ** this.reconnectAttempts), this.maxReconnectDelayMs);
    const jitter = Math.floor(Math.random() * 300);
    const delay = baseDelay + jitter;

    this.reconnectAttempts += 1;
    console.warn('[WsRpcClient] reconnect scheduled', { reason, delay, attempt: this.reconnectAttempts });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {
        this.scheduleReconnect('retry_failed');
      });
    }, delay);

    if (reason === 'close' && this.reconnectAttempts === this.maxReconnectAttempts) {
      for (const [id, holder] of this.pending.entries()) {
        this.pending.delete(id);
        holder.reject(new Error('WS disconnected'));
      }
    }
  }

  clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  close() {
    this.manualClose = true;
    this.clearReconnectTimer();

    if (this.ws && (this.ws.readyState === OPEN || this.ws.readyState === CONNECTING)) {
      this.ws.close(1000, 'Manual disconnect');
    }

    this.ws = null;
    this.connectPromise = null;

    for (const [id, holder] of this.pending.entries()) {
      this.pending.delete(id);
      holder.reject(new Error('WS client closed'));
    }

    this.queue = [];
  }
}
