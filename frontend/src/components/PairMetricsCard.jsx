import { Card, Table } from 'react-bootstrap';

const rows = [
  ['5m', 'm5'],
  ['15m', 'm15'],
  ['1h', 'h1']
];

function format(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toFixed(6);
}

export function PairMetricsCard({ snapshot }) {
  return (
    <Card className="my-3">
      <Card.Body>
        <Card.Title>Pair Metrics: {snapshot?.symbol || '—'}</Card.Title>
        <div className="mb-2"><strong>Current:</strong> {format(snapshot?.current)}</div>
        <Table striped bordered size="sm" responsive>
          <thead>
            <tr>
              <th>Timeframe</th>
              <th>High</th>
              <th>Low</th>
              <th>Current</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, key]) => {
              const row = snapshot?.timeframes?.[key] || {};
              return (
                <tr key={key}>
                  <td>{label}</td>
                  <td>{format(row.high)}</td>
                  <td>{format(row.low)}</td>
                  <td>{format(row.current)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
}
