import { EventEmitter } from 'node:events';

export class ModeGateway extends EventEmitter {
  constructor({ logger, configStore, paperGateway, restGateway, wsGateway }) {
    super();
    this.logger = logger;
    this.configStore = configStore;
    this.gateways = {
      paper: paperGateway,
      demo: restGateway,
      real: wsGateway
    };

    for (const [mode, gateway] of Object.entries(this.gateways)) {
      if (!gateway?.on) continue;
      gateway.on('execution', (payload) => this.emit('execution', { mode, ...payload }));
      gateway.on('fill', (payload) => this.emit('fill', { mode, ...payload }));
    }
  }

  getMode() {
    const configured = this.configStore.get().mode;
    return this.gateways[configured] ? configured : 'paper';
  }

  getActiveGateway() {
    const mode = this.getMode();
    const gateway = this.gateways[mode] || this.gateways.paper;
    return { mode, gateway };
  }

  async placeOrder(order, marketPrice) {
    const { mode, gateway } = this.getActiveGateway();
    if (mode === 'real' && gateway.tradeWs && !gateway.tradeWs.ws) {
      gateway.tradeWs.connect();
    }
    this.logger.info({ mode, symbol: order.symbol, orderType: order.type, side: order.side }, 'Placing order via mode gateway');
    try {
      return await gateway.placeOrder(order, marketPrice);
    } catch (error) {
      this.logger.error({ mode, message: error.message }, 'Mode gateway placeOrder failed');
      throw new Error(`mode=${mode}: ${error.message}`);
    }
  }

  async cancelOrder(symbol, orderId) {
    const { mode, gateway } = this.getActiveGateway();
    if (!gateway.cancelOrder) return null;
    this.logger.info({ mode, symbol, orderId }, 'Cancelling order via mode gateway');
    return gateway.cancelOrder(symbol, orderId);
  }

  async emergencyStop(closePositions = false) {
    const results = {};
    for (const [mode, gateway] of Object.entries(this.gateways)) {
      if (!gateway?.emergencyStop) continue;
      results[mode] = await gateway.emergencyStop(closePositions);
    }
    return results;
  }

  getPositions() {
    const { gateway } = this.getActiveGateway();
    if (!gateway?.getPositions) return [];
    return gateway.getPositions();
  }

  getOpenOrders() {
    const { gateway } = this.getActiveGateway();
    if (!gateway?.getOpenOrders) return [];
    return gateway.getOpenOrders();
  }

  onTick(symbol, price) {
    this.gateways.paper?.onTick?.(symbol, price);
  }
}
