import { Badge, Button, ButtonGroup, Container, Nav, Navbar } from 'react-bootstrap';
import { Link } from 'react-router-dom';

function statusVariant(status) {
  if (status === 'connected') return 'success';
  if (status === 'reconnecting' || status === 'connecting') return 'warning';
  return 'secondary';
}

function renderPrice(value) {
  if (!value) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function AppNavBar({ wsState, prices, onConnect, onDisconnect }) {
  return (
    <Navbar bg="dark" variant="dark" expand="lg" className="mb-3" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <Container>
        <Navbar.Brand as={Link} to="/">Range Bot</Navbar.Brand>
        <Nav className="me-auto">
          <Nav.Link as={Link} to="/">Dashboard</Nav.Link>
          <Nav.Link as={Link} to="/config">Config</Nav.Link>
          <Nav.Link as={Link} to="/symbols">Symbols</Nav.Link>
          <Nav.Link as={Link} to="/positions">Positions</Nav.Link>
          <Nav.Link as={Link} to="/logs">Logs</Nav.Link>
        </Nav>
        <ButtonGroup size="sm">
          <Button variant="outline-success" onClick={onConnect}>Connect WS</Button>
          <Button variant="outline-danger" onClick={onDisconnect}>Disconnect WS</Button>
        </ButtonGroup>
      </Container>
      <Container className="pb-2">
        <small>
          WS: <Badge bg={statusVariant(wsState?.status)}>{wsState?.status || 'disconnected'}</Badge>{' '}
          URL: {wsState?.url || '/ws'}
          {wsState?.attempt ? ` | attempt=${wsState.attempt}` : ''}
          {wsState?.nextDelayMs ? ` | next=${wsState.nextDelayMs}ms` : ''}
          {wsState?.lastError ? ` | error=${wsState.lastError}` : ''}
        </small>
      </Container>
      <Container className="pb-2">
        <small>BTC: {renderPrice(prices?.BTCUSDT)} | ETH: {renderPrice(prices?.ETHUSDT)} | SOL: {renderPrice(prices?.SOLUSDT)}</small>
      </Container>
    </Navbar>
  );
}
