import { ExternalLink } from 'lucide-react';

interface NewsItem {
  source?: string;
  url?: string;
  title?: string;
  summary?: string;
  date?: string;
  relevance?: string | number;
  tags?: string[];
}

export function OsintBlocks({ data }: { data: any[] | undefined }) {
  if (!data || data.length === 0) {
    return <div className="empty-state">No OSINT findings available.</div>;
  }

  const items = Array.isArray(data) ? data : [data];

  return (
    <div className="osint-blocks">
      {items.map((item, index) => {
        const newsItem = typeof item === 'string' ? { summary: item } : (item as NewsItem);
        
        return (
          <article key={index} className="osint-block panel">
            <div className="osint-block-header">
              <div className="block-index">Finding {String(index + 1).padStart(2, '0')}</div>
              {newsItem.source && <div className="block-source">{newsItem.source}</div>}
            </div>
            
            {newsItem.title && (
              <h3 className="osint-title">{newsItem.title}</h3>
            )}
            
            {newsItem.summary && (
              <p className="osint-summary">{newsItem.summary}</p>
            )}
            
            {newsItem.date && (
              <div className="osint-meta">
                <span className="osint-date">{new Date(newsItem.date).toLocaleDateString()}</span>
              </div>
            )}
            
            {newsItem.relevance && (
              <div className="osint-relevance">
                Relevance: <strong>{newsItem.relevance}</strong>
              </div>
            )}
            
            {newsItem.url && (
              <a 
                href={newsItem.url} 
                target="_blank" 
                rel="noreferrer"
                className="osint-link focus-ring"
              >
                <ExternalLink size={13} />
                View source
              </a>
            )}
            
            {newsItem.tags && newsItem.tags.length > 0 && (
              <div className="osint-tags">
                {newsItem.tags.map((tag, tagIndex) => (
                  <span key={tagIndex} className="tag">{tag}</span>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
