import { useEffect, useMemo, useRef, useState } from 'react';
import { Container } from 'react-bootstrap';
import { Navigate, Route, Routes } from 'react-router-dom';
import { WsRpcClient } from './api/wsClient';
import { AppNavBar } from './components/NavBar';
import { Toasts } from './components/Toasts';
import { Dashboard } from './routes/Dashboard';
import { ConfigRoute } from './routes/Config';
import { SymbolsRoute } from './routes/Symbols';
import { PositionsRoute } from './routes/Positions';
import { LogsRoute } from './routes/Logs';

export default function App() {
  const rpc = useMemo(() => new WsRpcClient(), []);
  const [status, setStatus] = useState({});
  const [wsState, setWsState] = useState(rpc.getState());
  const [schema, setSchema] = useState(null);
  const [config, setConfig] = useState(null);
  const [universe, setUniverse] = useState([]);
  const [symbols, setSymbols] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [decisionExplain, setDecisionExplain] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [marketSnapshot, setMarketSnapshot] = useState(null);
  const [prices, setPrices] = useState({ BTCUSDT: null, ETHUSDT: null, SOLUSDT: null });
  const configRef = useRef(null);
  const [logs, setLogs] = useState([]);
  const [toasts, setToasts] = useState([]);

  const notify = (text, variant = 'dark') => setToasts((t) => [...t, { id: `${Date.now()}-${Math.random()}`, text, variant }]);

  useEffect(() => {
    const unsubState = rpc.onStateChange(setWsState);
    rpc.connect().catch((e) => notify(`WebSocket: ${e.message}`, 'warning'));
    const unsub = rpc.onEvent((evt) => {
      const payload = evt.payload || {};
      setLogs((l) => [payload, ...l].slice(0, 200));
      if (evt.topic === 'marketPrices' && payload.kind === 'prices') setPrices(payload.prices || {});
      if (payload.kind === 'status') setStatus(payload);
      if (payload.kind === 'explain') setDecisionExplain(payload);
      if (payload.kind === 'candidates') setCandidates(payload.candidates || []);
      if (payload.kind === 'positionUpdate') setPositions(payload.positions || []);
      if (payload.kind === 'execution') notify(`Execution: ${JSON.stringify(payload).slice(0, 120)}`, 'info');
    });

    const load = async () => {
      setSchema(await rpc.call('getConfigSchema'));
      const loadedConfig = await rpc.call('getConfig');
      setConfig(loadedConfig);
      configRef.current = loadedConfig;
      setStatus(await rpc.call('getStatus'));
      setUniverse(await rpc.call('getUniverse'));
      setSymbols(await rpc.call('getAvailableSymbols'));
      setCandidates(await rpc.call('getCandidates'));
      setDecisionExplain(await rpc.call('getDecisionExplain'));
      setPositions(await rpc.call('getPositions'));
      setOrders(await rpc.call('getOpenOrders'));
      setMarketSnapshot(await rpc.call('getMarketSnapshot', { symbol: loadedConfig.symbol }));
    };

    const timer = setTimeout(() => load().catch((e) => notify(e.message, 'danger')), 300);
    const poll = setInterval(() => {
      rpc.call('getStatus').then(setStatus).catch(() => {});
      rpc.call('getDecisionExplain').then(setDecisionExplain).catch(() => {});
      rpc.call('getPositions').then(setPositions).catch(() => {});
      rpc.call('getOpenOrders').then(setOrders).catch(() => {});
      rpc.call('getUniverse').then(setUniverse).catch(() => {});
      rpc.call('getMarketSnapshot', { symbol: configRef.current?.symbol || '' }).then(setMarketSnapshot).catch(() => {});
    }, 3000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      unsub();
      unsubState();
      rpc.disconnect();
    };
  }, [rpc]);

  return (
    <>
      <AppNavBar
        wsState={wsState}
        prices={prices}
        onConnect={() => rpc.connect().catch((e) => notify(e.message, 'warning'))}
        onDisconnect={() => rpc.disconnect()}
      />
      <Container>
        <Routes>
          <Route path="/" element={<Dashboard status={status} decisionExplain={decisionExplain} candidates={candidates} rpc={rpc} notify={notify} marketSnapshot={marketSnapshot} />} />
          <Route
            path="/config"
            element={<ConfigRoute schema={schema} config={config} rpc={rpc} notify={notify} symbols={symbols} onConfigSaved={(next) => { setConfig(next); configRef.current = next; }} />}
          />
          <Route path="/symbols" element={<SymbolsRoute universe={universe} candidates={candidates} />} />
          <Route path="/positions" element={<PositionsRoute positions={positions} orders={orders} />} />
          <Route path="/logs" element={<LogsRoute logs={logs} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Container>
      <Toasts toasts={toasts} remove={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </>
  );
}
