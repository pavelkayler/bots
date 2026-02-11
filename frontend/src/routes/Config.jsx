import { ConfigForm } from '../components/ConfigForm';

export function ConfigRoute({ schema, config, rpc, notify, symbols, onConfigSaved }) {
  return (
    <ConfigForm
      schema={schema}
      config={config}
      symbols={symbols}
      onSave={async (draft) => {
        try {
          const updated = await rpc.call('setConfig', draft);
          onConfigSaved?.(updated);
          const mode = updated?.mode || draft?.mode || 'paper';
          notify(`Mode set to ${mode}`, 'success');
        } catch (error) {
          const mode = draft?.mode || config?.mode || 'unknown';
          if (mode === 'demo') notify(`Demo mode failed: ${error.message}`, 'danger');
          else notify(`Failed to apply config for mode ${mode}: ${error.message}`, 'danger');
        }
      }}
    />
  );
}
