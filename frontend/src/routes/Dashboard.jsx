import { Button, ButtonGroup, Card } from 'react-bootstrap';
import { StatusCard } from '../components/StatusCard';
import { CandidatesTable } from '../components/CandidatesTable';
import { PairMetricsCard } from '../components/PairMetricsCard';

export function Dashboard({ status, decisionExplain, candidates, rpc, notify, marketSnapshot }) {
  const call = async (method, params) => {
    try {
      await rpc.call(method, params);
      notify(`${method} success`, 'success');
    } catch (error) {
      notify(`${method} failed: ${error.message}`, 'danger');
    }
  };

  return (
    <>
      <StatusCard status={status || {}} explain={decisionExplain} />
      <Card className="my-3">
        <Card.Body>
          <Card.Title>Control</Card.Title>
          <ButtonGroup>
            <Button onClick={() => call('botStart')}>Start</Button>
            <Button variant="secondary" onClick={() => call('botStop')}>Stop</Button>
            <Button variant="danger" onClick={() => call('emergencyStop', { closePositions: true })}>Emergency Stop</Button>
          </ButtonGroup>
        </Card.Body>
      </Card>
      <Card>
        <Card.Body>
          <Card.Title>Candidates</Card.Title>
          <CandidatesTable candidates={candidates} />
        </Card.Body>
      </Card>
      <PairMetricsCard snapshot={marketSnapshot} />
    </>
  );
}
