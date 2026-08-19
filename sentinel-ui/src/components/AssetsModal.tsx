import { useState, useEffect } from 'react';
import { Download, X, Database, File } from 'lucide-react';
import type { FileMetadata } from '@/services/api';
import { fetchAssetFiles } from '@/services/api';
interface AssetsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export function AssetsModal({ isOpen, onClose }: AssetsModalProps) {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'dataset' | 'doc'>('all');

  useEffect(() => {
    if (!isOpen) return;
    
    const loadFiles = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAssetFiles();
        setFiles(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load files');
      } finally {
        setLoading(false);
      }
    };

    loadFiles();
  }, [isOpen]);

  const filteredFiles = filter === 'all' 
    ? files 
    : files.filter(f => f.type === filter);

  const datasets = filteredFiles.filter(f => f.type === 'dataset');
  const docs = filteredFiles.filter(f => f.type === 'doc');

  return (
    <>
      {isOpen && (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal-content assets-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Documentation &amp; Datasets</h2>
                <p>Download reference materials and dataset files</p>
              </div>
              <button
                type="button"
                className="modal-close focus-ring"
                onClick={onClose}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-filters">
              <button
                type="button"
                className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All ({filteredFiles.length})
              </button>
              <button
                type="button"
                className={`filter-btn ${filter === 'dataset' ? 'active' : ''}`}
                onClick={() => setFilter('dataset')}
              >
                <Database size={13} /> Datasets ({datasets.length})
              </button>
              <button
                type="button"
                className={`filter-btn ${filter === 'doc' ? 'active' : ''}`}
                onClick={() => setFilter('doc')}
              >
                <File size={13} /> Docs ({docs.length})
              </button>
            </div>

            <div className="modal-body">
              {loading && (
                <div className="loading-state">
                  <div className="spinner" />
                  Loading files...
                </div>
              )}

              {error && (
                <div className="error-state" role="alert">
                  {error}
                </div>
              )}

              {!loading && !error && filteredFiles.length === 0 && (
                <div className="empty-state">
                  No files found.
                </div>
              )}

              {!loading && !error && filteredFiles.length > 0 && (
                <div className="files-grid">
                  {filteredFiles.map((file) => (
                    <div key={`${file.type}-${file.name}`} className="file-card">
                      <div className="file-icon">
                        {file.type === 'dataset' ? (
                          <Database size={20} />
                        ) : (
                          <File size={20} />
                        )}
                      </div>
                      <div className="file-info">
                        <h3 className="file-name">{file.name}</h3>
                        <div className="file-meta">
                          <span className="file-type">{file.ext.toUpperCase()}</span>
                          <span className="file-size">{formatBytes(file.size)}</span>
                        </div>
                      </div>
                      <a
                        href={`${import.meta.env.VITE_API_URL || '/api'}${file.path}`}
                        download={file.name}
                        className="file-download focus-ring"
                        title={`Download ${file.name}`}
                      >
                        <Download size={16} />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .modal-content {
          background: white;
          border-radius: 12px;
          max-width: 700px;
          width: 90%;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }

        .modal-header {
          padding: 24px;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .modal-header p {
          margin: 4px 0 0;
          font-size: 13px;
          color: #666;
        }

        .modal-close {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          color: #666;
          display: flex;
          align-items: center;
        }

        .modal-filters {
          padding: 16px 24px;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .filter-btn {
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          font-size: 12px;
          color: #666;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .filter-btn:hover {
          border-color: #9ca3af;
          color: #000;
        }

        .filter-btn.active {
          background: #1f2937;
          color: white;
          border-color: #1f2937;
        }

        .modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }

        .loading-state,
        .error-state,
        .empty-state {
          text-align: center;
          padding: 48px 24px;
          color: #666;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid #e5e7eb;
          border-top-color: #1f2937;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          margin: 0 auto 12px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .files-grid {
          display: grid;
          gap: 12px;
        }

        .file-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: #f9fafb;
          transition: all 0.2s;
        }

        .file-card:hover {
          border-color: #d1d5db;
          background: white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .file-icon {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f3f4f6;
          border-radius: 6px;
          color: #666;
        }

        .file-info {
          flex: 1;
          min-width: 0;
        }

        .file-name {
          margin: 0;
          font-size: 14px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .file-meta {
          margin-top: 4px;
          display: flex;
          gap: 8px;
          font-size: 12px;
          color: #999;
        }

        .file-type,
        .file-size {
          display: inline-block;
        }

        .file-size::before {
          content: ' • ';
          margin-right: 4px;
        }

        .file-download {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          padding: 6px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          color: #666;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .file-download:hover {
          background: #1f2937;
          color: white;
          border-color: #1f2937;
        }
      `}</style>
    </>
  );
}
