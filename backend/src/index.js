import { createServer } from 'node:http';
import { loadEnv } from './env.js';
import { createLogger } from './logger.js';
import { createHttpServer } from './httpServer.js';
import { createRpcServer } from './ws/rpcServer.js';
import { ConfigStore } from './bot/configStore.js';
import { BybitRestClient } from './bybit/restClient.js';
import { BybitPublicWs } from './bybit/publicWs.js';
import { BybitPrivateTradeWs } from './bybit/privateTradeWs.js';
import { InstrumentsCache } from './bybit/instrumentsCache.js';
import { PaperGateway } from './execution/paperGateway.js';
import { RestGateway } from './execution/restGateway.js';
import { WsGateway } from './execution/wsGateway.js';
import { ModeGateway } from './execution/modeGateway.js';
import { RangeBot } from './bot/rangeBot.js';
import { OrderManager } from './bot/orderManager.js';

const env = loadEnv();
const logger = createLogger(env);
const configStore = new ConfigStore('./data/config.json');
const restClient = new BybitRestClient(env, logger);
const publicWs = new BybitPublicWs(env, logger);
const tradeWs = new BybitPrivateTradeWs(env, logger);
const instrumentsCache = new InstrumentsCache(restClient, logger);
const paperGateway = new PaperGateway(logger, configStore);
const restGateway = new RestGateway(restClient, logger);
const wsGateway = new WsGateway(tradeWs, restGateway, logger);

const gateway = new ModeGateway({
  logger,
  configStore,
  paperGateway,
  restGateway,
  wsGateway
});

const bot = new RangeBot({
  env,
  logger,
  configStore,
  restClient,
  publicWs,
  instrumentsCache,
  gateway,
  orderManager: new OrderManager()
});

const app = createHttpServer({ env, bot });
const server = createServer(app);
createRpcServer({ server, path: env.WS_PATH, bot, configStore, logger });

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, mode: env.TRADING_MODE, wsPath: env.WS_PATH }, 'Server started');
});
