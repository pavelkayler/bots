import { WebSocketServer } from 'ws';
import { ok, fail } from './rpcProtocol.js';
import { configSchema } from '../bot/configSchema.js';

export function createRpcServer({ server, path, bot, configStore, logger }) {
  const wsPath = path || '/ws';
  const wss = new WebSocketServer({ server, path: wsPath });

  wss.on('connection', (socket, req) => {
    const remoteAddress = req.socket?.remoteAddress || 'unknown';
    logger.info({ remoteAddress, path: req.url || wsPath }, 'RPC client connected');

    const push = (event) => {
      if (socket.readyState !== socket.OPEN) return;
      socket.send(JSON.stringify(event));
    };
    const unsubscribe = (event) => push(event);
    bot.on('event', unsubscribe);

    socket.on('message', async (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        socket.send(JSON.stringify(fail(null, 'BAD_JSON', 'Invalid JSON')));
        return;
      }

      if (message.type !== 'request') return;
      try {
        logger.info({ method: message.method, params: message.params || {} }, 'RPC request');
        const result = await dispatch(message.method, message.params || {});
        socket.send(JSON.stringify(ok(message.id, result)));
      } catch (error) {
        logger.warn({ method: message.method, message: error.message, stack: error.stack }, 'RPC request failed');
        socket.send(JSON.stringify(fail(message.id, 'RPC_ERROR', error.message, error.details || null)));
      }
    });

    socket.on('error', (error) => {
      logger.warn({ message: error.message, remoteAddress }, 'RPC socket error');
    });

    socket.on('close', (code, reason) => {
      logger.info({ code, reason: reason.toString() }, 'RPC client disconnected');
      bot.off('event', unsubscribe);
    });
  });

  async function dispatch(method, params) {
    switch (method) {
      case 'ping': return { pong: true };
      case 'getConfigSchema': return configSchema;
      case 'getConfig': return configStore.get();
      case 'setConfig': {
        try {
          const updated = configStore.set(params);
          await bot.refreshUniverse();
          bot.emitEvent('status', bot.getStatus());
          return updated;
        } catch (error) {
          logger.warn({ message: error.message, params }, 'setConfig failed without shutting down RPC server');
          throw error;
        }
      }
      case 'botStart': {
        try {
          await bot.start();
          return bot.getStatus();
        } catch (error) {
          logger.error({ message: error.message }, 'botStart failed without shutting down RPC server');
          throw error;
        }
      }
      case 'botStop': {
        bot.stop();
        return bot.getStatus();
      }
      case 'emergencyStop': {
        try {
          return await bot.emergencyStop(Boolean(params.closePositions));
        } catch (error) {
          logger.error({ message: error.message }, 'emergencyStop failed without shutting down RPC server');
          throw error;
        }
      }
      case 'getStatus': return bot.getStatus();
      case 'getUniverse': return bot.getUniverse();
      case 'getCandidates': return bot.getCandidates();
      case 'getAvailableSymbols': return bot.getAvailableSymbols();
      case 'getMarketSnapshot': return bot.getMarketSnapshot(params.symbol);
      case 'getDecisionExplain': return bot.getDecisionExplain();
      case 'getPositions': return bot.gateway.getPositions ? await bot.gateway.getPositions() : [];
      case 'getOpenOrders': return bot.gateway.getOpenOrders ? await bot.gateway.getOpenOrders() : [];
      default: throw new Error(`Unknown method: ${method}`);
    }
  }

  wss.on('error', (error) => {
    logger.error({ message: error.message }, 'RPC WebSocket server error');
  });

  logger.info({ path: wsPath }, 'RPC WebSocket server started');
  return wss;
}
