import { useSearchParams } from 'react-router-dom';
import { Tabs, tabPanelProps } from '../components/Tabs';
import { useDocumentTitle } from '../useDocumentTitle';
import { BrandKitTab } from './branding/BrandKitTab';
import { VoiceTab } from './branding/VoiceTab';

const TABS = [
  { id: 'kit', label: 'Brand kit' },
  { id: 'voice', label: 'Writing voice' },
];

export default function Branding() {
  useDocumentTitle('Branding');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'voice' ? 'voice' : 'kit';

  return (
    <div className="page page-tight">
      <header>
        <h1 className="page-title">Branding</h1>
        <p className="lead">How everything you make looks and sounds.</p>
      </header>
      <Tabs
        label="Branding sections"
        idPrefix="brand"
        tabs={TABS}
        value={tab}
        onChange={(t) => setParams(t === 'kit' ? {} : { tab: t }, { replace: true })}
      />
      <div {...tabPanelProps('brand', tab)} className="panel">
        {tab === 'kit' ? <BrandKitTab /> : <VoiceTab />}
      </div>
    </div>
  );
}
