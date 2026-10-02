import React, { useState, useEffect } from 'react';
import {
  FileText,
  Table,
  Search,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Download,
  List,
  FileSpreadsheet,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';

interface DocsPanelProps {
  activeDocPath?: string | null;
  onPageChange?: (page: number) => void;
}

export function DocsPanel({ activeDocPath }: DocsPanelProps) {
  const [content, setContent] = useState<string>('');
  const [format, setFormat] = useState<string>('TXT');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchMatches, setSearchMatches] = useState<Array<{ page: number; snippet: string }>>([]);
  const [searching, setSearching] = useState<boolean>(false);

  const fileName = activeDocPath ? activeDocPath.split('/').pop() || 'Document' : 'No Document';
  const ext = fileName.split('.').pop()?.toLowerCase() || 'txt';
  const isSpreadsheet = ext === 'csv' || ext === 'tsv' || ext === 'xlsx' || ext === 'xls';
  const isMarkdown = ext === 'md' || ext === 'markdown';

  useEffect(() => {
    if (!activeDocPath) return;

    let isMounted = true;
    setLoading(true);

    axios
      .get(`http://localhost:5001/documents/read?path=${encodeURIComponent(activeDocPath)}&page=${currentPage}`)
      .then((res) => {
        if (!isMounted) return;
        setContent(res.data.content || '');
        setFormat(res.data.format || ext.toUpperCase());
        setTotalPages(res.data.totalPages || 1);
        setLoading(false);
      })
      .catch(() => {
        // Fallback to /file-content
        axios
          .get(`http://localhost:5001/file-content?path=${encodeURIComponent(activeDocPath)}`)
          .then((res) => {
            if (!isMounted) return;
            setContent(res.data.content || '');
            setLoading(false);
          })
          .catch(() => {
            if (!isMounted) return;
            setContent(`Failed to load document at ${activeDocPath}`);
            setLoading(false);
          });
      });

    return () => {
      isMounted = false;
    };
  }, [activeDocPath, currentPage, ext]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !activeDocPath) return;
    setSearching(true);
    try {
      const res = await axios.get(
        `http://localhost:5001/documents/search?path=${encodeURIComponent(activeDocPath)}&query=${encodeURIComponent(searchQuery)}`
      );
      setSearchMatches(res.data.matches || []);
    } catch {
      setSearchMatches([]);
    } finally {
      setSearching(false);
    }
  };

  // Parse CSV table data
  const parsedTableData = React.useMemo(() => {
    if (!isSpreadsheet || !content) return null;
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return null;

    const headers = lines[0].split(',').map((h) => h.replace(/^["']|["']$/g, '').trim());
    const rows = lines.slice(1, 100).map((l) =>
      l.split(',').map((c) => c.replace(/^["']|["']$/g, '').trim())
    );

    return { headers, rows };
  }, [isSpreadsheet, content]);

  return (
    <div className="docs-panel-container">
      {/* Top Document Bar */}
      <div className="docs-navbar">
        <div className="doc-meta-info">
          {isSpreadsheet ? (
            <FileSpreadsheet size={15} className="text-emerald-400" />
          ) : (
            <FileText size={15} className="text-indigo-400" />
          )}
          <span className="font-semibold">{fileName}</span>
          <span className="badge-format">{format}</span>
        </div>

        {/* Search within document */}
        <div className="doc-search-box">
          <Search size={12} className="text-zinc-500" />
          <input
            type="text"
            placeholder="Search in document..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          {searchQuery && (
            <button className="search-run-btn" onClick={handleSearch}>
              {searching ? '...' : 'Find'}
            </button>
          )}
        </div>

        {/* Pagination controls for multi-page docs */}
        {totalPages > 1 && (
          <div className="doc-pagination">
            <button
              className="page-nav-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            >
              <ChevronLeft size={13} />
            </button>
            <span className="page-indicator">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="page-nav-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Main Document Content */}
      <div className="docs-body">
        {loading ? (
          <div className="docs-loading">Loading document...</div>
        ) : !activeDocPath ? (
          <div className="docs-empty-placeholder">
            <BookOpen size={48} className="text-zinc-600 mb-3" />
            <h3 className="text-zinc-300 font-medium">No Document Selected</h3>
            <p className="text-zinc-500 text-sm max-w-sm text-center">
              Select a PDF, Word, Excel, CSV, or Markdown document to read and explore specification or requirements.
            </p>
          </div>
        ) : isSpreadsheet && parsedTableData ? (
          /* Spreadsheet / CSV Table Viewer */
          <div className="spreadsheet-view">
            <table className="spreadsheet-table">
              <thead>
                <tr>
                  <th>#</th>
                  {parsedTableData.headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedTableData.rows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    <td className="row-num">{rIdx + 1}</td>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : isMarkdown ? (
          /* Markdown Document Viewer */
          <div className="markdown-doc-view">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          /* Standard / PDF / Doc Reader */
          <div className="standard-doc-view">
            <pre className="doc-text-content">{content}</pre>
          </div>
        )}

        {/* Search Results Drawer */}
        {searchMatches.length > 0 && (
          <div className="search-matches-drawer">
            <div className="drawer-header">
              <span>Matches for "{searchQuery}" ({searchMatches.length})</span>
              <button className="close-btn" onClick={() => setSearchMatches([])}>✕</button>
            </div>
            <div className="matches-list">
              {searchMatches.map((m, idx) => (
                <div
                  key={idx}
                  className="match-item"
                  onClick={() => {
                    setCurrentPage(m.page);
                    setSearchMatches([]);
                  }}
                >
                  <span className="match-page">Page {m.page}:</span>
                  <span className="match-snippet">{m.snippet}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
