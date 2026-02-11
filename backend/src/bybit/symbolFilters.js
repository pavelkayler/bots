export function isLinearUsdtPerpetual(item = {}) {
  const symbol = String(item.symbol || '').toUpperCase();
  const quoteCoin = String(item.quoteCoin || item.settleCoin || '').toUpperCase();
  const contractType = String(item.contractType || '').toUpperCase();

  if (!symbol.endsWith('USDT')) return false;
  if (symbol.includes('-')) return false;
  if (symbol.includes('PERP')) return false;
  if (quoteCoin && quoteCoin !== 'USDT') return false;
  if (contractType && contractType !== 'LINEARPERPETUAL') return false;

  return true;
}
