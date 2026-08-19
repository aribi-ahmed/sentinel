import { useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  BookOpen,
  Check,
  ChevronRight,
  Database,
  Download,
  FileText,
  Globe,
  Lock,
  Network,
  Shield,
  Terminal,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  approveInvestigation,
  fetchAuditHistory,
  startInvestigation,
  type AuditRecord,
  type InvestigationData,
} from './services/api';
import { OsintBlocks } from './components/OsintBlocks';
import { RagBlocks } from './components/RagBlocks';
import { AssetsModal } from './components/AssetsModal';
import './App.css';

type EvidenceTab = 'research' | 'financials' | 'osint' | 'compliance' | 'logs';

const tabs: { id: EvidenceTab; label: string; icon: typeof FileText }[] = [
  { id: 'research', label: 'Research baseline', icon: FileText },
  { id: 'financials', label: 'Financials', icon: TrendingUp },
  { id: 'osint', label: 'OSINT findings', icon: Globe },
  { id: 'compliance', label: 'Compliance RAG', icon: BookOpen },
  { id: 'logs', label: 'Audit logs', icon: Terminal },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalisePayload(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function formatLabel(label: string) {
  return label
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatScalar(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  return String(value);
}

function splitNarrative(value: string) {
  return value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function HumanValue({ value }: { value: unknown }) {
  const normalised = normalisePayload(value);
  if (Array.isArray(normalised)) {
    return (
      <div className="nested-list">
        {normalised.map((item, index) => (
          <div className="nested-item" key={index}>
            <HumanValue value={item} />
          </div>
        ))}
      </div>
    );
  }
  if (isRecord(normalised)) {
    return <HumanizedData value={normalised} compact />;
  }
  if (typeof normalised === 'string') {
    return <span className="human-value narrative-value">{normalised}</span>;
  }
  return <span className="human-value">{formatScalar(normalised)}</span>;
}

function HumanizedData({ value, compact = false }: { value: unknown; compact?: boolean }) {
  const normalised = normalisePayload(value);
  if (Array.isArray(normalised)) {
    return (
      <div className={`evidence-stack ${compact ? 'is-compact' : ''}`}>
        {normalised.map((item, index) => (
          <article className="evidence-card" key={index}>
            <div className="evidence-card-index">Evidence {String(index + 1).padStart(2, '0')}</div>
            <HumanizedData value={item} compact />
          </article>
        ))}
      </div>
    );
  }
  if (isRecord(normalised)) {
    const entries = Object.entries(normalised).filter(([, item]) => item !== null && item !== undefined && item !== '');
    return entries.length ? (
      <dl className={`field-grid ${compact ? 'is-compact' : ''}`}>
        {entries.map(([key, item]) => (
          <div className={`field-row ${isRecord(item) || Array.isArray(item) ? 'is-wide' : ''}`} key={key}>
            <dt>{formatLabel(key)}</dt>
            <dd><HumanValue value={item} /></dd>
          </div>
        ))}
      </dl>
    ) : <EmptyData label="No readable fields returned." />;
  }
  if (typeof normalised === 'string') {
    const paragraphs = splitNarrative(normalised);
    return (
      <div className="human-copy">
        {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
    );
  }
  return <div className="human-copy"><p>{formatScalar(normalised)}</p></div>;
}

function MarkdownInline({ text }: { text: string }) {
  const tokenPattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(tokenPattern).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={index}>{part.slice(1, -1)}</code>;
        }
        if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
          return <em key={index}>{part.slice(1, -1)}</em>;
        }
        const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
        if (link) {
          return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

function MarkdownHeading({ level, children }: { level: number; children: ReactNode }) {
  if (level === 1) return <h1>{children}</h1>;
  if (level === 2) return <h2>{children}</h2>;
  if (level === 3) return <h3>{children}</h3>;
  if (level === 4) return <h4>{children}</h4>;
  if (level === 5) return <h5>{children}</h5>;
  return <h6>{children}</h6>;
}

function MarkdownReport({ content }: { content: string }) {
  const blocks: ReactNode[] = [];
  const lines = content.replace(/\r/g, '').split('\n');
  let paragraph: string[] = [];
  let unordered: string[] = [];
  let ordered: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(<p key={`paragraph-${blocks.length}`}><MarkdownInline text={paragraph.join(' ')} /></p>);
      paragraph = [];
    }
  };
  const flushLists = () => {
    if (unordered.length) {
      blocks.push(<ul key={`unordered-${blocks.length}`}>{unordered.map((item, index) => <li key={index}><MarkdownInline text={item} /></li>)}</ul>);
      unordered = [];
    }
    if (ordered.length) {
      blocks.push(<ol key={`ordered-${blocks.length}`}>{ordered.map((item, index) => <li key={index}><MarkdownInline text={item} /></li>)}</ol>);
      ordered = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushLists();
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushAll();
      return;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushAll();
      blocks.push(
        <MarkdownHeading key={`heading-${blocks.length}`} level={heading[1].length}>
          <MarkdownInline text={heading[2]} />
        </MarkdownHeading>,
      );
      return;
    }
    if (/^(---+|\*\*\*+|___+)$/.test(trimmed)) {
      flushAll();
      blocks.push(<hr key={`rule-${blocks.length}`} />);
      return;
    }
    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      ordered.length && flushLists();
      unordered.push(bullet[1]);
      return;
    }
    const number = trimmed.match(/^\d+\.\s+(.+)$/);
    if (number) {
      flushParagraph();
      unordered.length && flushLists();
      ordered.push(number[1]);
      return;
    }
    if (trimmed.startsWith('>')) {
      flushAll();
      blocks.push(<blockquote key={`quote-${blocks.length}`}><MarkdownInline text={trimmed.replace(/^>\s?/, '')} /></blockquote>);
      return;
    }
    paragraph.push(trimmed);
  });
  flushAll();
  return <div className="markdown-report">{blocks}</div>;
}

function hasEvidence(value: unknown) {
  const normalised = normalisePayload(value);
  if (Array.isArray(normalised)) return normalised.length > 0;
  if (isRecord(normalised)) return Object.keys(normalised).length > 0;
  return typeof normalised === 'string' ? normalised.trim().length > 0 : normalised !== null && normalised !== undefined;
}

function shortId(value: string) {
  return value.length > 13 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function RiskBadge({ level, confidence }: { level?: string; confidence?: number }) {
  const safe = ['LOW', 'CLEAR', 'APPROVED'].includes((level || '').toUpperCase());
  const confidencePercent = confidence ? Math.round(confidence * 100) : null;
  
  return (
    <div className={`risk-badge ${safe ? 'safe' : ''}`} data-testid="status-risk-assessment">
      <span className="risk-dot" aria-hidden="true" />
      <span>Risk assessment</span>
      <strong>{level || 'PENDING'}</strong>
      {confidencePercent !== null && (
        <span className="confidence-indicator" title="Agent certainty level">
          ({confidencePercent}% confidence)
        </span>
      )}
    </div>
  );
}

type AgentKey = 'supervisor' | 'research' | 'financials' | 'osint' | 'compliance';

interface AgentDefinition {
  id: AgentKey;
  name: string;
  shortName: string;
  role: string;
  description: string;
  signal: string;
  tab?: EvidenceTab;
  x: number;
  y: number;
}

const agentDefinitions: AgentDefinition[] = [
  {
    id: 'supervisor',
    name: 'AI supervisor',
    shortName: 'SUP',
    role: 'Synthesis controller',
    description: 'Arbitrates specialist signals and prepares the human review checkpoint.',
    signal: 'Cross-agent synthesis',
    x: 360,
    y: 194,
  },
  {
    id: 'research',
    name: 'Research analyst',
    shortName: 'RES',
    role: 'Entity baseline',
    description: 'Builds the operating profile, ownership context, and reported fundamentals.',
    signal: 'Research baseline',
    tab: 'research',
    x: 126,
    y: 90,
  },
  {
    id: 'financials',
    name: 'Financial monitor',
    shortName: 'FIN',
    role: 'Market signals',
    description: 'Checks financial indicators and market-facing exposure for anomalies.',
    signal: 'Financial evidence',
    tab: 'financials',
    x: 594,
    y: 90,
  },
  {
    id: 'osint',
    name: 'OSINT scout',
    shortName: 'OSI',
    role: 'Open-source signals',
    description: 'Surfaces adverse media, public records, and source-linked findings.',
    signal: 'OSINT findings',
    tab: 'osint',
    x: 126,
    y: 304,
  },
  {
    id: 'compliance',
    name: 'Policy examiner',
    shortName: 'POL',
    role: 'Compliance RAG',
    description: 'Maps observed facts against retrieved policy vectors and controls.',
    signal: 'Compliance vectors',
    tab: 'compliance',
    x: 594,
    y: 304,
  },
];

function agentHasEvidence(investigation: InvestigationData | null, id: AgentKey) {
  if (!investigation) return false;
  if (id === 'research') return hasEvidence(investigation.research_data);
  if (id === 'financials') return hasEvidence(investigation.financial_data);
  if (id === 'osint') return hasEvidence(investigation.news_data);
  if (id === 'compliance') return hasEvidence(investigation.compliance_data);
  return Boolean(investigation.supervisor_reasoning);
}

function AgentGraph({
  investigation,
  selectedAgent,
  onSelect,
}: {
  investigation: InvestigationData | null;
  selectedAgent: AgentKey;
  onSelect: (agent: AgentKey) => void;
}) {
  const [hoveredAgent, setHoveredAgent] = useState<AgentKey | null>(null);
  const activeAgent = hoveredAgent || selectedAgent;
  const supervisor = agentDefinitions[0];
  const specialists = agentDefinitions.slice(1);

  const selectAgent = (id: AgentKey) => {
    onSelect(id);
  };

  return (
    <section className="agent-console panel cornered" aria-labelledby="agent-graph-title">
      <div className="section-heading agent-console-heading">
        <div>
          <div className="eyebrow">/ live agent topology</div>
          <h2 id="agent-graph-title">Investigation relay</h2>
        </div>
        <div className="graph-legend" aria-label="Agent status legend">
          <span><i className="legend-dot complete" /> signal received</span>
          <span><i className="legend-dot pending" /> pending</span>
        </div>
      </div>
      <div className="agent-console-grid">
        <div className="graph-stage" aria-label="Interactive agent relationship graph">
          <svg className="agent-graph" viewBox="0 0 720 394" role="img" aria-labelledby="agent-graph-title agent-graph-description">
            <desc id="agent-graph-description">
              The AI supervisor is connected to four specialist agents. Select a specialist to open its evidence stream.
            </desc>
            <defs>
              <linearGradient id="relay-line" x1="0" x2="1">
                <stop offset="0" stopColor="#75d2aa" stopOpacity=".2" />
                <stop offset=".5" stopColor="#f0ae48" stopOpacity=".8" />
                <stop offset="1" stopColor="#75d2aa" stopOpacity=".2" />
              </linearGradient>
              <filter id="relay-shadow" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#f0ae48" floodOpacity=".2" />
              </filter>
            </defs>
            <g className="graph-grid" aria-hidden="true">
              <path d="M0 50H720M0 130H720M0 210H720M0 290H720M0 370H720M60 0V394M180 0V394M300 0V394M420 0V394M540 0V394M660 0V394" />
            </g>
            {specialists.map((agent) => {
              const isConnected = activeAgent === 'supervisor' || activeAgent === agent.id;
              const complete = agentHasEvidence(investigation, agent.id);
              return (
                <g
                  key={`edge-${agent.id}`}
                  className={`graph-edge ${isConnected ? 'is-connected' : ''}`}
                  aria-hidden="true"
                >
                  <line x1={agent.x} y1={agent.y} x2={supervisor.x} y2={supervisor.y} />
                  <circle className="edge-pulse" cx={(agent.x + supervisor.x) / 2} cy={(agent.y + supervisor.y) / 2} r="2.5">
                    {complete && <animate attributeName="cx" values={`${agent.x};${supervisor.x}`} dur="2.8s" repeatCount="indefinite" />}
                  </circle>
                </g>
              );
            })}
            {agentDefinitions.map((agent) => {
              const isSupervisor = agent.id === 'supervisor';
              const isSelected = selectedAgent === agent.id;
              const isHovered = hoveredAgent === agent.id;
              const complete = agentHasEvidence(investigation, agent.id);
              const status = complete ? 'signal received' : isSupervisor ? 'processing' : 'awaiting signal';
              return (
                <g
                  key={agent.id}
                  className={`graph-node ${isSupervisor ? 'supervisor-node' : 'specialist-node'} ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''}`}
                  transform={`translate(${agent.x} ${agent.y})`}
                  role="button"
                  tabIndex={0}
                  data-testid={`graph-node-${agent.id}`}
                  aria-label={`${agent.name}, ${agent.role}, ${status}. ${isSupervisor ? 'Select to inspect supervisor synthesis.' : `Select to inspect ${agent.signal}.`}`}
                  aria-pressed={isSelected}
                  onMouseEnter={() => setHoveredAgent(agent.id)}
                  onMouseLeave={() => setHoveredAgent(null)}
                  onFocus={() => setHoveredAgent(agent.id)}
                  onBlur={() => setHoveredAgent(null)}
                  onClick={() => selectAgent(agent.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectAgent(agent.id);
                    }
                  }}
                >
                  <title>{`${agent.name}: ${status}`}</title>
                  <circle className="node-aura" r={isSupervisor ? 58 : 42} />
                  <circle className="node-ring" r={isSupervisor ? 44 : 33} />
                  <circle className="node-core" r={isSupervisor ? 36 : 26} filter={isSelected ? 'url(#relay-shadow)' : undefined} />
                  <text className="node-code" textAnchor="middle" y="5">{agent.shortName}</text>
                  <text className="node-name" textAnchor="middle" y={isSupervisor ? 74 : 58}>{agent.name}</text>
                  <text className="node-status" textAnchor="middle" y={isSupervisor ? 89 : 73}>{status}</text>
                </g>
              );
            })}
          </svg>
          <div className="graph-caption">
            <span><Network size={13} aria-hidden="true" /> Select a node to route its evidence into the inspector.</span>
                <span className="graph-snapshot">snapshot / {investigation?.status || 'standby'}</span>
          </div>
        </div>
        <AgentInspector
          investigation={investigation}
          selectedAgent={activeAgent}
          onOpenEvidence={(tab) => {
            onSelect(tab === 'research' ? 'research' : tab === 'financials' ? 'financials' : tab === 'osint' ? 'osint' : 'compliance');
          }}
        />
      </div>
    </section>
  );
}

function AgentInspector({
  investigation,
  selectedAgent,
  onOpenEvidence,
}: {
  investigation: InvestigationData | null;
  selectedAgent: AgentKey;
  onOpenEvidence: (tab: EvidenceTab) => void;
}) {
  const agent = agentDefinitions.find((item) => item.id === selectedAgent) || agentDefinitions[0];
  const complete = agentHasEvidence(investigation, agent.id);
  const tabLabel = agent.tab ? tabs.find((tab) => tab.id === agent.tab)?.label : 'Supervisor rationale';
  return (
    <aside className="agent-inspector" aria-live="polite" aria-labelledby="inspector-title">
      <div className="inspector-topline">
        <span className="eyebrow">/ selected channel</span>
        <span className={`inspector-status ${complete ? 'complete' : 'pending'}`}>
          <i /> {complete ? 'signal received' : 'awaiting signal'}
        </span>
      </div>
      <div className="inspector-code">{agent.shortName}</div>
      <h3 id="inspector-title">{agent.name}</h3>
      <div className="inspector-role">{agent.role}</div>
      <p>{agent.description}</p>
      <dl className="inspector-meta">
        <div><dt>Channel</dt><dd>{tabLabel}</dd></div>
        <div><dt>Entity</dt><dd>{investigation?.ticker || 'awaiting target'}</dd></div>
      </dl>
      {agent.tab && investigation ? (
        <button
          type="button"
          className="inspector-action focus-ring"
          onClick={() => onOpenEvidence(agent.tab as EvidenceTab)}
          data-testid={`button-inspect-${agent.id}`}
        >
          Open evidence stream <ChevronRight size={14} aria-hidden="true" />
        </button>
      ) : (
        <div className="inspector-note">
          {investigation
            ? 'Supervisor output stays visible above and governs the human checkpoint.'
            : 'Launch an investigation to populate this channel with live evidence.'}
        </div>
      )}
    </aside>
  );
}

function App() {
  const [ticker, setTicker] = useState('TSLA');
  const [subjectName, setSubjectName] = useState('Tesla Inc');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<EvidenceTab>('research');
  const [investigation, setInvestigation] = useState<InvestigationData | null>(null);
  const [history, setHistory] = useState<AuditRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentKey>('supervisor');
  const [showAssetsModal, setShowAssetsModal] = useState(false);

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const records = await fetchAuditHistory();
      setHistory(Array.isArray(records) ? records : []);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Ledger is unreachable.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleStart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = subjectName.trim();
    const cleanTicker = ticker.trim().toUpperCase();
    if (!cleanName || !cleanTicker) {
      setError('Target entity and ticker are required before agents can launch.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await startInvestigation(cleanName, cleanTicker);
      setInvestigation(data);
      setSelectedAgent('supervisor');
      setActiveTab('research');
      void loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger investigation.');
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (approved: boolean) => {
    if (!investigation) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await approveInvestigation(investigation.id, approved);
      setInvestigation(updated);
      void loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process officer decision.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReport = () => {
    if (!investigation?.final_report) return;
    const blob = new Blob([investigation.final_report], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sentinel-report-${investigation.ticker || 'investigation'}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleAgentSelect = (agent: AgentKey) => {
    setSelectedAgent(agent);
    const definition = agentDefinitions.find((item) => item.id === agent);
    if (definition?.tab) setActiveTab(definition.tab);
  };

  const showCheckpoint =
    Boolean(investigation) &&
    investigation?.status !== 'completed' &&
    investigation?.status !== 'failed' &&
    investigation?.human_approved !== true &&
    investigation?.human_approved !== false;

  const renderEvidence = () => {
    if (!investigation) return null;
    if (activeTab === 'research') {
      return hasEvidence(investigation.research_data)
        ? <div data-testid="data-research"><HumanizedData value={investigation.research_data} /></div>
        : <EmptyData label="No research baseline returned." />;
    }
    if (activeTab === 'financials') {
      return hasEvidence(investigation.financial_data)
        ? <div data-testid="data-financials"><HumanizedData value={investigation.financial_data} /></div>
        : <EmptyData label="No financial evidence returned." />;
    }
    if (activeTab === 'osint') {
      return hasEvidence(investigation.news_data)
        ? <div data-testid="data-osint"><OsintBlocks data={investigation.news_data} /></div>
        : <EmptyData label="No OSINT findings returned." />;
    }
    if (activeTab === 'compliance') {
      return hasEvidence(investigation.compliance_data)
        ? <RagBlocks data={investigation.compliance_data} />
        : <EmptyData label="No compliance vectors retrieved." />;
    }
    return investigation.logs?.length ? (
      <div className="log-list" data-testid="data-logs">
        {investigation.logs.map((log, index) => <div key={`${log}-${index}`}>{log}</div>)}
      </div>
    ) : <EmptyData label="Execution sequence initialized. Awaiting agent telemetry." />;
  };

  return (
    <div className="sentinel-shell">
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand" data-testid="text-brand">
            <div className="brand-mark" aria-hidden="true"><Shield size={17} strokeWidth={1.6} /></div>
            <div className="brand-name">SENTINEL <span>//</span> AI</div>
          </div>
          <div className="topbar-right">
            <div className="api-status" data-testid="status-api">
              <span className="status-dot" aria-hidden="true" />
              <span>REST API</span>
              <strong>active</strong>
            </div>
            <button
              type="button"
              className="assets-toggle focus-ring"
              onClick={() => setShowAssetsModal(true)}
              data-testid="button-toggle-assets"
            >
              <FileText size={15} strokeWidth={1.5} />
              <span>Docs &amp; data</span>
            </button>
            <button
              type="button"
              className="ledger-toggle focus-ring"
              aria-expanded={showHistory}
              onClick={() => {
                const nextOpenState = !showHistory;
                setShowHistory(nextOpenState);
                if (nextOpenState) void loadHistory();
              }}
              data-testid="button-toggle-ledger"
            >
              <Database size={15} strokeWidth={1.5} />
              <span>{showHistory ? 'Close ledger' : 'SQL ledger'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="container main">
        <section className="hero-grid animate-enter" aria-labelledby="page-title">
          <div className="hero-copy">
            <div className="eyebrow">// compliance intelligence protocol</div>
            <h1 id="page-title">Enterprise <em>risk</em> evaluator</h1>
            <p>
              Autonomous multi-agent synthesis across research, market signals, OSINT,
              and policy controls — with a human decision checkpoint before release.
            </p>
            <form className="launch-panel panel" onSubmit={handleStart} data-testid="form-launch-investigation">
              <div className="field">
                <label htmlFor="ticker">Ticker</label>
                <input
                  id="ticker"
                  value={ticker}
                  onChange={(event) => setTicker(event.target.value.toUpperCase())}
                  placeholder="TSLA"
                  autoComplete="off"
                  required
                  className="focus-ring"
                  data-testid="input-ticker"
                />
              </div>
              <div className="field">
                <label htmlFor="entity">Target entity</label>
                <input
                  id="entity"
                  value={subjectName}
                  onChange={(event) => setSubjectName(event.target.value)}
                  placeholder="Tesla Inc"
                  autoComplete="organization"
                  required
                  className="entity focus-ring"
                  data-testid="input-subject-name"
                />
              </div>
              <button type="submit" className="launch-button focus-ring" disabled={loading} data-testid="button-run-agents">
                {loading ? 'Analyzing…' : 'Run agents'}
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </form>
            {error && (
              <div className="error-banner" role="alert" data-testid="status-error">
                <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                {error}
              </div>
            )}
          </div>
          <div className="hero-index" aria-label="System metadata">
            <div>MODE / <strong>HUMAN-IN-LOOP</strong></div>
            <div>AGENTS / <strong>04 SPECIALISTS</strong></div>
            <div>LEDGER / <strong>APPEND-ONLY</strong></div>
          </div>
        </section>

        <AnimatePresence initial={false}>
          {showHistory && (
            <motion.section
              className="ledger-panel panel"
              initial={{ opacity: 0, height: 0, y: -8 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -8 }}
              transition={{ duration: .25 }}
              aria-labelledby="ledger-title"
              data-testid="section-audit-ledger"
            >
              <div className="section-heading">
                <div>
                  <div className="eyebrow">/ immutable activity trail</div>
                  <h2 id="ledger-title">SQL audit database ledger</h2>
                </div>
                <div className="record-count" data-testid="text-ledger-count">{history.length} records stored</div>
              </div>
              {historyLoading ? (
                <div className="empty-ledger" data-testid="status-ledger-loading">
                  <div className="skeleton" style={{ height: 12, maxWidth: 300, margin: '0 auto 12px' }} />
                  <div className="skeleton" style={{ height: 12, maxWidth: 210, margin: '0 auto' }} />
                </div>
              ) : historyError ? (
                <div className="table-error" role="alert" data-testid="status-ledger-error">
                  Unable to read ledger: {historyError}
                  <button type="button" className="ledger-toggle" onClick={() => void loadHistory()} data-testid="button-retry-ledger">Retry</button>
                </div>
              ) : history.length === 0 ? (
                <div className="empty-ledger" data-testid="status-ledger-empty">
                  <Database size={20} />
                  <div>No investigations have been committed to the ledger yet.</div>
                </div>
              ) : (
                <div className="grid-scroll">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Investigation ID</th><th>Timestamp</th><th>Company</th><th>Ticker</th><th>Status</th><th>Risk</th><th>Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((record, index) => (
                        <tr key={`${record['Database ID']}-${index}`} data-testid={`row-ledger-${record['Database ID'] || index}`}>
                          <td>{shortId(record['Database ID'] || 'unassigned')}</td>
                          <td>{record['Created At'] || '—'}</td>
                          <td>{record.Company || 'Unknown entity'}</td>
                          <td>{record.Ticker || '—'}</td>
                          <td>{record.Status || '—'}</td>
                          <td>{record['Risk Level'] || '—'}</td>
                          <td>{record.Approved || 'PENDING'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {investigation && (
          <motion.section
            className="investigation"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: .45 }}
            aria-labelledby="investigation-title"
            data-testid="section-investigation"
          >
            <div className="target-card panel cornered">
              <div>
                <div className="target-meta">Target entity</div>
                <h2 id="investigation-title" className="target-title">
                  {investigation.subject_name} <span>({investigation.ticker || 'N/A'})</span>
                </h2>
                <div className="target-id">ID: {investigation.id || 'pending assignment'}</div>
              </div>
              <RiskBadge level={investigation.risk_level} confidence={investigation.confidence} />
            </div>

            <div className="rationale-card panel cornered" data-testid="card-supervisor-rationale">
              <div className="eyebrow">/ supervisor synthesis</div>
              <h2>AI supervisor rationale</h2>
              <div className="sub">Synthesized risk policy verdict</div>
              <p className={`rationale-body ${investigation.supervisor_reasoning ? '' : 'is-pending'}`} data-testid="text-supervisor-reasoning">
                {investigation.supervisor_reasoning || 'Supervisor evaluating specialist evidence…'}
              </p>
            </div>

            <AgentGraph
              investigation={investigation}
              selectedAgent={selectedAgent}
              onSelect={handleAgentSelect}
            />

            <section className="evidence" aria-labelledby="evidence-title">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">/ evidence matrix</div>
                  <h2 id="evidence-title">Specialist evidence</h2>
                </div>
                <div className="record-count"><Network size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} /> live synthesis</div>
              </div>
              <div className="tabs" role="tablist" aria-label="Investigation evidence">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === id}
                    aria-controls={`panel-${id}`}
                    key={id}
                    className={`tab focus-ring ${activeTab === id ? 'active' : ''}`}
                    onClick={() => setActiveTab(id)}
                    data-testid={`tab-${id}`}
                  >
                    <Icon size={14} strokeWidth={1.5} />
                    {label}
                  </button>
                ))}
              </div>
               <div id={`panel-${activeTab}`} className="evidence-panel panel" role="tabpanel" data-testid={`panel-${activeTab}`} tabIndex={0}>
                <div className="panel-kicker">Human-readable specialist analysis / {activeTab}</div>
                {renderEvidence()}
              </div>
            </section>

            {showCheckpoint && (
              <section className="checkpoint panel" aria-labelledby="checkpoint-title" data-testid="section-human-checkpoint">
                <div className="checkpoint-copy">
                  <div className="eyebrow">// human compliance checkpoint</div>
                  <h2 id="checkpoint-title">Officer decision required</h2>
                  <p>Review the specialist findings above and render a final compliance judgment to advance this investigation.</p>
                </div>
                <div className="checkpoint-actions">
                  <button type="button" className="reject-button focus-ring" onClick={() => void handleApproval(false)} disabled={loading} data-testid="button-reject-assessment">
                    <X size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} /> Reject assessment
                  </button>
                  <button type="button" className="decision-button focus-ring" onClick={() => void handleApproval(true)} disabled={loading} data-testid="button-approve-assessment">
                    <Check size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} /> Approve &amp; generate report
                  </button>
                </div>
              </section>
            )}

            {(investigation.status === 'completed' || Boolean(investigation.final_report)) && (
              <section className="report panel cornered" aria-labelledby="report-title" data-testid="section-final-report">
                <div className="report-header">
                  <div>
                    <div className="eyebrow">// completed assessment</div>
                    <h2 id="report-title">Executive compliance report</h2>
                  </div>
                  <button type="button" className="download-button focus-ring" onClick={handleDownloadReport} disabled={!investigation.final_report} data-testid="button-download-report">
                    <Download size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} /> Download MD
                  </button>
                </div>
                <div className="report-body" data-testid="text-final-report">
                  {investigation.final_report
                    ? <MarkdownReport content={investigation.final_report} />
                    : <p className="report-pending">Report generation is in progress. Awaiting final payload.</p>}
                </div>
              </section>
            )}
          </motion.section>
        )}

        {!investigation && (
          <>
            <AgentGraph
              investigation={null}
              selectedAgent={selectedAgent}
              onSelect={handleAgentSelect}
            />
            <section className="empty-ledger" style={{ marginTop: 28 }} data-testid="status-pending-investigation">
              <Lock size={20} />
              <div>Awaiting target selection. Launch an investigation to unlock the evidence matrix.</div>
            </section>
          </>
        )}

        <footer className="footer-line">
          <span>Sentinel // controlled intelligence surface</span>
          <span><Activity size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} /> All decisions ledgered</span>
        </footer>
      </main>

      <AssetsModal isOpen={showAssetsModal} onClose={() => setShowAssetsModal(false)} />
    </div>
  );
}

function EmptyData({ label }: { label: string }) {
  return <div className="empty-data" data-testid="status-evidence-empty">{label}</div>;
}

export default App;