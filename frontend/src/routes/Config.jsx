import { ConfigForm } from '../components/ConfigForm';

export function ConfigRoute({ schema, config, rpc, notify, symbols, onConfigSaved }) {
  return (
    <ConfigForm
      schema={schema}
      config={config}
      symbols={symbols}
      onSave={async (draft) => {
        const updated = await rpc.call('setConfig', draft);
        onConfigSaved?.(updated);
        notify('Config saved', 'success');
      }}
    />
  );
}
