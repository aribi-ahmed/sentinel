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
  ExternalLink,
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

  // 1. Direct standard JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }

  // 2. Python single-quoted list/dict string parser
  if (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  ) {
    try {
      let jsonStr = trimmed
        // Replace Python keys 'key': with "key":
        .replace(/'([a-zA-Z0-9_]+)'\s*:/g, '"$1":')
        // Replace Python string values : 'val' with : "val"
        .replace(/:\s*'([^']*)'/g, ': "$1"')
        // Handle Python booleans and None
        .replace(/:\s*True/gi, ': true')
        .replace(/:\s*False/gi, ': false')
        .replace(/:\s*None/gi, ': null');

      return JSON.parse(jsonStr);
    } catch {
      /* continue */
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

function formatScalar(value: unknown): string {
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

interface OsintItem {
  title?: string;
  link?: string;
  snippet?: string;
}

function parseOsintResults(raw: unknown): OsintItem[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        return {
          title: String(obj.title || obj.name || 'OSINT Intelligence Link'),
          link: String(obj.link || obj.url || obj.href || ''),
          snippet: String(obj.snippet || obj.body || obj.summary || obj.description || ''),
        };
      }
      return { snippet: String(item) };
    });
  }

  if (typeof raw !== 'string') return [{ snippet: String(raw) }];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) || typeof parsed === 'object') {
      return parseOsintResults(parsed);
    }
  } catch {
    /* Continue to regex fallback */
  }

  const items: OsintItem[] = [];
  const regex = /(?:snippet|body|summary):\s*(.*?)(?:,\s*|\s*)(?:title|name):\s*(.*?)(?:,\s*|\s*)(?:link|url|href):\s*(https?:\/\/[^\s,]+)/g;

  let match;
  while ((match = regex.exec(raw)) !== null) {
    items.push({
      snippet: match[1].trim(),
      title: match[2].trim(),
      link: match[3].trim(),
    });
  }

  if (items.length === 0) {
    const altRegex = /(?:title|name):\s*(.*?)(?:,\s*|\s*)(?:link|url|href):\s*(https?:\/\/[^\s,]+)(?:,\s*|\s*)(?:snippet|body|summary):\s*(.*?)(?=(?:title|name):|$)/g;
    while ((match = altRegex.exec(raw)) !== null) {
      items.push({
        title: match[1].trim(),
        link: match[2].trim(),
        snippet: match[3].trim(),
      });
    }
  }

  if (items.length === 0) {
    return [{ snippet: raw }];
  }

  return items;
}

function OsintResultsRenderer({ rawResults }: { rawResults: unknown }) {
  const items = parseOsintResults(rawResults);

  if (items.length === 1 && !items[0].title && !items[0].link) {
    return <FormattedTextWithLinks text={items[0].snippet || String(rawResults)} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 mt-2">
      {items.map((item, idx) => {
        let domain = '';
        if (item.link) {
          try {
            domain = new URL(item.link).hostname.replace('www.', '');
          } catch {
            domain = 'Source';
          }
        }

        return (
          <div
            key={idx}
            className="group border border-border/80 bg-card/60 hover:bg-card hover:border-accent/40 p-4 transition-all duration-200 rounded-none shadow-sm space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <h5 className="font-sans text-sm font-bold text-foreground group-hover:text-accent transition-colors leading-snug">
                {item.link ? (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline flex items-center gap-1.5"
                  >
                    <span>{item.title || 'OSINT Source'}</span>
                    <ExternalLink className="h-3.5 w-3.5 text-accent opacity-80 group-hover:opacity-100 inline-block shrink-0" />
                  </a>
                ) : (
                  <span>{item.title || `Finding #${idx + 1}`}</span>
                )}
              </h5>
              {domain && (
                <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 bg-muted text-mutedForeground border border-border/50 shrink-0">
                  {domain}
                </span>
              )}
            </div>

            {item.snippet && (
              <p className="text-xs text-foreground/80 leading-relaxed font-sans pt-1">
                {item.snippet}
              </p>
            )}

            {item.link && (
              <div className="pt-2 border-t border-border/40 font-mono text-[11px]">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent/90 hover:text-accent truncate block hover:underline"
                >
                  {item.link}
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FormattedTextWithLinks({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s,]+)/g;
  const parts = text.split(urlRegex);

  return (
    <div className="text-xs text-foreground/90 font-sans leading-relaxed space-y-2 whitespace-pre-wrap">
      {parts.map((part, index) => {
        if (part.match(urlRegex)) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline hover:text-accent/80 inline-flex items-center gap-1 font-mono text-[11px] break-all"
            >
              {part}
              <ExternalLink className="h-3 w-3 inline" />
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
}

export function HumanizedData({ value, compact = false }: { value: unknown; compact?: boolean }) {
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

  if (isRecord(normalised) && ('query' in normalised || 'results' in normalised)) {
    return (
      <div className="osint-evidence-wrapper space-y-4 p-2">
        {Boolean(normalised.query) && (
          <div className="border-b border-border/60 pb-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent font-semibold block mb-1">
              // SEARCH QUERY TARGET
            </span>
            <div className="text-base font-bold text-foreground font-mono bg-muted/30 px-3 py-2 border border-border/50 inline-block">
              {String(normalised.query)}
            </div>
          </div>
        )}

        {Boolean(normalised.results) && (
          <div className="space-y-2 pt-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-mutedForeground font-semibold block">
              OSINT INTELLIGENCE SOURCES &amp; FINDINGS
            </span>
            <OsintResultsRenderer rawResults={normalised.results} />
          </div>
        )}
      </div>
    );
  }

  if (isRecord(normalised)) {
    const entries = Object.entries(normalised).filter(
      ([, item]) => item !== null && item !== undefined && item !== ''
    );
    return entries.length ? (
      <dl className={`field-grid ${compact ? 'is-compact' : ''}`}>
        {entries.map(([key, item]) => (
          <div
            className={`field-row ${isRecord(item) || Array.isArray(item) ? 'is-wide' : ''}`}
            key={key}
          >
            <dt>{formatLabel(key)}</dt>
            <dd>
              <HumanValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    ) : (
      <EmptyData label="No readable fields returned." />
    );
  }

  if (typeof normalised === 'string') {
    const paragraphs = splitNarrative(normalised);
    return (
      <div className="human-copy">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="human-copy">
      <p>{formatScalar(normalised)}</p>
    </div>
  );
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
      if (ordered.length) flushLists();
      unordered.push(bullet[1]);
      return;
    }
    const number = trimmed.match(/^\d+\.\s+(.+)$/);
    if (number) {
      flushParagraph();
      if (unordered.length) flushLists();
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

interface ComplianceVectorItem {
  source: string;
  content: string;
  relevance?: string;
}

function parseComplianceItems(raw: unknown): ComplianceVectorItem[] {
  if (!raw) return [];

  let data: unknown = raw;

  // 1. Handle stringified JSON or Python single-quoted dict reprs
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
      try {
        data = JSON.parse(trimmed);
      } catch {
        try {
          const jsonLike = trimmed
            .replace(/'([a-zA-Z0-9_]+)'\s*:/g, '"$1":')
            .replace(/:\s*'([^']*)'/g, ': "$1"')
            .replace(/:\s*True/gi, ': true')
            .replace(/:\s*False/gi, ': false')
            .replace(/:\s*None/gi, ': null')
            .replace(/'/g, '"');
          data = JSON.parse(jsonLike);
        } catch {
          try {
            data = new Function(`return ${trimmed}`)();
          } catch {
            return [{ source: 'Internal Policy', content: trimmed }];
          }
        }
      }
    } else {
      return [{ source: 'Internal Policy', content: trimmed }];
    }
  }

  // 2. Flatten nested arrays (e.g., [[obj, obj]])
  if (Array.isArray(data)) {
    const flattened = data.flat(Infinity);
    const results: ComplianceVectorItem[] = [];

    for (const item of flattened) {
      results.push(...parseComplianceItems(item));
    }
    return results;
  }

  // 3. Extract properties from object directly
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    return [
      {
        source: String(obj.source || obj.title || 'Internal Policy'),
        content: String(obj.content || obj.summary || obj.text || ''),
        relevance: obj.relevance ? String(obj.relevance) : undefined,
      },
    ];
  }

  return [{ source: 'Internal Policy', content: String(data) }];
}

function renderVectorText(content: string) {
  const cleaned = content.replace(/^o\s+/, '');

  if (cleaned.includes('•')) {
    const parts = cleaned
      .split('•')
      .map((part) => part.trim().replace(/^o\s+/, ''))
      .filter(Boolean);

    return (
      <ul style={{ margin: 0, paddingLeft: '1.25rem', listStyleType: 'disc' }}>
        {parts.map((part, i) => (
          <li key={i} style={{ marginBottom: '0.5rem', lineHeight: '1.6' }}>
            {part}
          </li>
        ))}
      </ul>
    );
  }

  return splitNarrative(cleaned).map((paragraph, pIdx) => (
    <p key={pIdx}>{paragraph}</p>
  ));
}

function ComplianceEvidence({ value }: { value: unknown }) {
  const items = parseComplianceItems(value);

  if (items.length === 0) {
    return <EmptyData label="No compliance vectors retrieved." />;
  }

  return (
    <div className="compliance-list" data-testid="data-compliance">
      {items.map((item, index) => (
        <article className="compliance-item" key={index}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div className="compliance-item-label" style={{ margin: 0 }}>
              Vector {String(index + 1).padStart(2, '0')} <span style={{ color: 'var(--white)', fontWeight: 400 }}>— {item.source}</span>
            </div>
            {item.relevance && (
              <span style={{ font: '10px var(--mono)', padding: '2px 8px', background: 'rgba(247,147,26,.1)', color: 'var(--orange)', border: '1px solid rgba(247,147,26,.3)', borderRadius: '3px' }}>
                {item.relevance}
              </span>
            )}
          </div>

          <div className="human-copy">
            {renderVectorText(item.content)}
          </div>
        </article>
      ))}
    </div>
  );
}

function shortId(value: string) {
  return value.length > 13 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function RiskBadge({ level }: { level?: string }) {
  const safe = ['LOW', 'CLEAR', 'APPROVED'].includes((level || '').toUpperCase());
  return (
    <div className={`risk-badge ${safe ? 'safe' : ''}`} data-testid="status-risk-assessment">
      <span className="risk-dot" aria-hidden="true" />
      <span>Risk assessment</span>
      <strong>{level || 'PENDING'}</strong>
    </div>
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
  const [showAssets, setShowAssets] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        ? <div data-testid="data-osint"><HumanizedData value={investigation.news_data} /></div>
        : <EmptyData label="No OSINT findings returned." />;
    }
    if (activeTab === 'compliance') {
      return hasEvidence(investigation.compliance_data)
        ? <ComplianceEvidence value={investigation.compliance_data} />
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
            <button
              type="button"
              className="ledger-toggle focus-ring"
              onClick={() => setShowAssets(true)}
              data-testid="button-open-assets"
            >
              <BookOpen size={15} strokeWidth={1.5} />
              <span>Docs &amp; datasets</span>
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
                        <tr key={`${String(record['Database ID'])}-${index}`} data-testid={`row-ledger-${String(record['Database ID'] || index)}`}>
                          <td>{shortId(String(record['Database ID'] || 'unassigned'))}</td>
                          <td>{formatScalar(record['Created At'])}</td>
                          <td>{formatScalar(record.Company || 'Unknown entity')}</td>
                          <td>{formatScalar(record.Ticker)}</td>
                          <td>{formatScalar(record.Status)}</td>
                          <td>{formatScalar(record['Risk Level'])}</td>
                          <td>{formatScalar(record.Approved || 'PENDING')}</td>
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
              <RiskBadge level={investigation.risk_level} />
            </div>

            <div className="rationale-card panel cornered" data-testid="card-supervisor-rationale">
              <div className="eyebrow">/ supervisor synthesis</div>
              <h2>AI supervisor rationale</h2>
              <div className="sub">Synthesized risk policy verdict</div>
              <p className={`rationale-body ${investigation.supervisor_reasoning ? '' : 'is-pending'}`} data-testid="text-supervisor-reasoning">
                {investigation.supervisor_reasoning || 'Supervisor evaluating specialist evidence…'}
              </p>
            </div>

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
              <div className="evidence-panel panel" role="tabpanel" data-testid={`panel-${activeTab}`}>
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
          <section className="empty-ledger" style={{ marginTop: 70 }} data-testid="status-pending-investigation">
            <Lock size={20} />
            <div>Awaiting target selection. Launch an investigation to unlock the evidence matrix.</div>
          </section>
        )}

        <footer className="footer-line">
          <span>Sentinel // controlled intelligence surface</span>
          <span><Activity size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} /> All decisions ledgered</span>
        </footer>
      </main>

      <AssetsModal isOpen={showAssets} onClose={() => setShowAssets(false)} />
    </div>
  );
}

function EmptyData({ label }: { label: string }) {
  return <div className="empty-data" data-testid="status-evidence-empty">{label}</div>;
}

export default App;