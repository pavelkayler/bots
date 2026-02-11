import { useEffect, useState } from 'react';
import { Button, Card, Col, Form, Row } from 'react-bootstrap';

export function ConfigForm({ schema, config, onSave, symbols = [] }) {
  const [advanced, setAdvanced] = useState(false);
  const [draft, setDraft] = useState(config || {});

  useEffect(() => setDraft(config || {}), [config]);

  if (!schema) return null;

  return (
    <>
      <Form.Check className="mb-2" label="Show advanced" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
      {schema.groups.map((group) => (
        <Card key={group.id} className="mb-3">
          <Card.Body>
            <Card.Title>{group.title}</Card.Title>
            {group.fields.filter((f) => advanced || !f.advanced).map((field) => (
              <Form.Group as={Row} className="mb-2" key={field.key}>
                <Form.Label column sm={3}>{field.key}</Form.Label>
                <Col sm={4}>
                  {field.type === 'boolean' ? (
                    <Form.Check checked={Boolean(draft[field.key])} onChange={(e) => setDraft({ ...draft, [field.key]: e.target.checked })} />
                  ) : field.type === 'select' ? (
                    <Form.Select value={draft[field.key] ?? field.default ?? ''} onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}>
                      {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </Form.Select>
                  ) : field.key === 'symbol' ? (
                    <Form.Select value={draft[field.key] ?? ''} onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}>
                      <option value="">auto (universe selection)</option>
                      {symbols.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
                    </Form.Select>
                  ) : field.type === 'string' ? (
                    <Form.Control type="text" value={draft[field.key] ?? ''} onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value.toUpperCase() })} />
                  ) : (
                    <Form.Control type="number" min={field.min} max={field.max} step={field.step} value={draft[field.key]} onChange={(e) => setDraft({ ...draft, [field.key]: Number(e.target.value) })} />
                  )}
                </Col>
                <Col sm={5}><small>{field.description} ({field.unit || 'flag'})</small></Col>
              </Form.Group>
            ))}
          </Card.Body>
        </Card>
      ))}
      <Button onClick={() => onSave(draft)}>Save config</Button>
    </>
  );
}
