const OPEN = WebSocket.OPEN;
const CONNECTING = WebSocket.CONNECTING;
const CLOSING = WebSocket.CLOSING;

export class WsRpcClient {
  constructor(path = import.meta.env.VITE_WS_PATH || '/ws') {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

    this.path = normalizedPath;
    this.url = `${protocol}://${window.location.host}${normalizedPath}`;
    this.id = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.statusListeners = new Set();
    this.queue = [];

    this.ws = null;
    this.connectPromise = null;
    this.reconnectTimer = null;

    this.maxQueueSize = 250;
    this.maxReconnectDelayMs = 30000;

    this.state = {
      status: 'disconnected',
      url: this.url,
      attempt: 0,
      nextDelayMs: null,
      lastError: null,
      autoReconnectEnabled: true
    };
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    for (const cb of this.statusListeners) cb(this.getState());
  }

  getState() {
    return { ...this.state };
  }

  onStateChange(cb) {
    this.statusListeners.add(cb);
    cb(this.getState());
    return () => this.statusListeners.delete(cb);
  }

  connect({ manual = true } = {}) {
    if (manual) {
      this.state.autoReconnectEnabled = true;
    }

    if (this.ws && (this.ws.readyState === CONNECTING || this.ws.readyState === OPEN)) {
      return this.connectPromise || Promise.resolve();
    }

    this.clearReconnectTimer();

    this.setState({ status: 'connecting', lastError: null, nextDelayMs: null });

    this.connectPromise = new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(this.url);
      } catch (error) {
        this.connectPromise = null;
        this.setState({ status: 'disconnected', lastError: error.message });
        this.scheduleReconnect('connect_error');
        reject(error);
        return;
      }

      this.ws = ws;
      let settled = false;

      ws.onopen = () => {
        this.setState({ status: 'connected', attempt: 0, nextDelayMs: null, lastError: null });
        this.flushQueue();
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      ws.onmessage = (event) => {
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

      ws.onerror = () => {
        const message = `WS connection failed for path ${this.path}`;
        this.setState({ lastError: message });
        if (!settled) {
          settled = true;
          reject(new Error(message));
        }
      };

      ws.onclose = () => {
        this.ws = null;
        this.connectPromise = null;
        this.setState({ status: this.state.autoReconnectEnabled ? 'reconnecting' : 'disconnected' });
        if (this.state.autoReconnectEnabled) {
          this.scheduleReconnect('close');
        }
      };
    });

    return this.connectPromise;
  }

  disconnect() {
    this.state.autoReconnectEnabled = false;
    this.clearReconnectTimer();

    if (this.ws && (this.ws.readyState === OPEN || this.ws.readyState === CONNECTING || this.ws.readyState === CLOSING)) {
      this.ws.close(1000, 'Manual disconnect');
    }

    this.ws = null;
    this.connectPromise = null;

    for (const [id, holder] of this.pending.entries()) {
      this.pending.delete(id);
      holder.reject(new Error('WS client disconnected'));
    }

    this.queue = [];
    this.setState({ status: 'disconnected', nextDelayMs: null });
  }

  onEvent(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  call(method, params = {}) {
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
      this.ws.send(serialized);
      return;
    }

    this.enqueue(serialized, pendingId);

    if (this.ws && this.ws.readyState === CONNECTING) return;

    if (this.state.autoReconnectEnabled) {
      this.connect({ manual: false }).catch(() => {
        this.scheduleReconnect('send_connect_failed');
      });
    }
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
    }
  }

  scheduleReconnect(reason) {
    if (!this.state.autoReconnectEnabled || this.reconnectTimer) return;

    const attempt = this.state.attempt + 1;
    const baseDelay = Math.min(1000 * (2 ** (attempt - 1)), this.maxReconnectDelayMs);
    const jitter = Math.floor(Math.random() * 350);
    const delay = baseDelay + jitter;

    this.setState({ status: 'reconnecting', attempt, nextDelayMs: delay, lastError: this.state.lastError || reason });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect({ manual: false }).catch(() => {
        this.scheduleReconnect('retry_failed');
      });
    }, delay);
  }

  clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.setState({ nextDelayMs: null });
  }
}
