import { Card, Col, Row } from 'react-bootstrap';

export function StatusCard({ status, explain }) {
  const rows = [
    ['Mode', status.tradingMode],
    ['ENABLE_TRADING', status.enableTrading],
    ['BYBIT_ENV', status.bybitEnv],
    ['Symbol', status.symbol],
    ['Symbols', status.symbols],
    ['Candidates', status.candidates],
    ['Positions', status.positions],
    ['Last signal', status.lastSignalTime ? new Date(status.lastSignalTime).toLocaleString() : '—'],
    ['Last decision', status.lastDecisionTime ? new Date(status.lastDecisionTime).toLocaleString() : '—']
  ];
  return (
    <Card>
      <Card.Body>
        <Card.Title>Status</Card.Title>
        {rows.map(([k, v]) => (
          <Row key={k} className="mb-1">
            <Col xs={5}><strong>{k}</strong></Col>
            <Col>{String(v ?? '—')}</Col>
          </Row>
        ))}
        <hr />
        <Row>
          <Col xs={5}><strong>Почему нет сделок</strong></Col>
          <Col>{(explain?.reasonsBlocked || []).length ? explain.reasonsBlocked.join(', ') : 'Нет блокировок'}</Col>
        </Row>
      </Card.Body>
    </Card>
  );
}
