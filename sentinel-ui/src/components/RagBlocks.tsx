import { Download, FileText } from 'lucide-react';

interface ComplianceItem {
  content?: string;
  source?: string;
  source_url?: string;
  confidence?: number;
  policy_area?: string;
  section?: string;
}

export function RagBlocks({ data }: { data: string[] | undefined }) {
  if (!data || data.length === 0) {
    return <div className="empty-state">No compliance vectors retrieved.</div>;
  }

  return (
    <div className="rag-blocks">
      {data.map((item, index) => {
        let ragItem: ComplianceItem = {};
        
        // Try to parse as JSON if it looks like JSON
        if (typeof item === 'string') {
          const trimmed = item.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
              (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
              ragItem = JSON.parse(trimmed);
            } catch {
              ragItem = { content: item };
            }
          } else {
            ragItem = { content: item };
          }
        }
        
        const content = ragItem.content || (typeof item === 'string' ? item : '');
        const displayText = content.substring(0, 300) + (content.length > 300 ? '...' : '');
        
        return (
          <article key={index} className="rag-block panel">
            <div className="rag-block-header">
              <div className="block-index">Policy vector {String(index + 1).padStart(2, '0')}</div>
              {ragItem.policy_area && (
                <div className="block-policy">{ragItem.policy_area}</div>
              )}
            </div>
            
            <div className="rag-content">
              <p>{displayText}</p>
            </div>
            
            {ragItem.confidence !== undefined && (
              <div className="rag-confidence">
                <div className="confidence-label">Confidence</div>
                <div className="confidence-bar">
                  <div 
                    className="confidence-fill" 
                    style={{ 
                      width: `${Math.min(Math.max(ragItem.confidence * 100, 0), 100)}%` 
                    }} 
                  />
                </div>
                <div className="confidence-value">
                  {Math.round((ragItem.confidence || 0) * 100)}%
                </div>
              </div>
            )}
            
            {ragItem.section && (
              <div className="rag-section">
                Section: <strong>{ragItem.section}</strong>
              </div>
            )}
            
            {ragItem.source_url && (
              <button 
                type="button"
                className="rag-download focus-ring"
                onClick={() => window.open(ragItem.source_url, '_blank')}
              >
                <Download size={13} />
                Download source
              </button>
            )}
            {ragItem.source && !ragItem.source_url && (
              <div className="rag-source">
                <FileText size={13} />
                Source: {ragItem.source}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
