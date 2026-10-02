import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { WorkspaceContext } from '../context/workspaceContext.js';

export interface DocumentSection {
  title: string;
  page?: number;
  content: string;
}

export interface DocumentStructure {
  success: boolean;
  filePath: string;
  format: string;
  totalLength: number;
  sections: DocumentSection[];
  sheets?: string[];
  pageCount?: number;
  error?: string;
}

export class DocumentService {
  /**
   * Read document with targeted pagination or query filtering.
   * Prevents blowing up context window with massive files.
   */
  static async readDocument(
    filePath: string,
    options: {
      page?: number;
      pageSize?: number;
      query?: string;
    } = {}
  ): Promise<{
    success: boolean;
    filePath: string;
    format: string;
    content: string;
    page: number;
    totalPages: number;
    matchedQuery?: boolean;
    error?: string;
  }> {
    const absPath = WorkspaceContext.resolvePath(filePath);
    if (!fsSync.existsSync(absPath)) {
      throw new Error(`Document file not found: ${filePath}`);
    }

    const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
    const rawBuffer = await fs.readFile(absPath);
    let fullText = '';

    if (ext === 'csv' || ext === 'tsv') {
      fullText = rawBuffer.toString('utf8');
    } else if (ext === 'md' || ext === 'txt' || ext === 'rtf' || ext === 'json' || ext === 'yaml') {
      fullText = rawBuffer.toString('utf8');
    } else if (ext === 'pdf') {
      // Extract text streams from PDF buffer
      fullText = this.extractTextFromPdfBuffer(rawBuffer);
    } else if (ext === 'docx') {
      // Extract text content from docx/zip XML
      fullText = this.extractTextFromDocxBuffer(rawBuffer);
    } else if (ext === 'xlsx' || ext === 'xls') {
      fullText = this.extractTextFromSpreadsheetBuffer(rawBuffer);
    } else {
      fullText = rawBuffer.toString('utf8', 0, Math.min(rawBuffer.length, 50000));
    }

    let totalPages = 1;
    let targetPage = options.page || 1;
    let content = '';
    let matchedQuery = false;

    if (ext === 'csv' || ext === 'tsv') {
      const allLines = fullText.split('\n').filter((l) => l.trim().length > 0);
      const header = allLines[0] || '';
      const dataRows = allLines.slice(1);
      const rowsPerPage = options.pageSize || 25;
      totalPages = Math.max(1, Math.ceil(dataRows.length / rowsPerPage));
      if (options.query) {
        const q = options.query.toLowerCase();
        const foundRowIdx = dataRows.findIndex((r) => r.toLowerCase().includes(q));
        if (foundRowIdx !== -1) {
          targetPage = Math.floor(foundRowIdx / rowsPerPage) + 1;
          matchedQuery = true;
        }
      }
      if (targetPage > totalPages) targetPage = totalPages;
      if (targetPage < 1) targetPage = 1;
      const startIdx = (targetPage - 1) * rowsPerPage;
      const endIdx = startIdx + rowsPerPage;
      const pageRows = dataRows.slice(startIdx, endIdx);
      content = [header, ...pageRows].join('\n');
    } else {
      // Chunk by pages (approx 1800 characters per page or by form-feed / headings)
      const PAGE_CHAR_SIZE = options.pageSize || 1800;
      totalPages = Math.max(1, Math.ceil(fullText.length / PAGE_CHAR_SIZE));

      if (options.query) {
        const q = options.query.toLowerCase();
        const matchIndex = fullText.toLowerCase().indexOf(q);
        if (matchIndex !== -1) {
          targetPage = Math.floor(matchIndex / PAGE_CHAR_SIZE) + 1;
          matchedQuery = true;
        }
      }

      if (targetPage > totalPages) targetPage = totalPages;
      if (targetPage < 1) targetPage = 1;
      const startIdx = (targetPage - 1) * PAGE_CHAR_SIZE;
      const endIdx = Math.min(startIdx + PAGE_CHAR_SIZE, fullText.length);
      content = fullText.slice(startIdx, endIdx);
    }

    return {
      success: true,
      filePath,
      format: ext.toUpperCase(),
      content: content.trim(),
      page: targetPage,
      totalPages,
      matchedQuery,
    };
  }

  static async searchDocument(
    filePath: string,
    query: string
  ): Promise<{
    success: boolean;
    filePath: string;
    query: string;
    matches: Array<{ page: number; snippet: string }>;
    error?: string;
  }> {
    const absPath = WorkspaceContext.resolvePath(filePath);
    if (!fsSync.existsSync(absPath)) {
      throw new Error(`Document file not found: ${filePath}`);
    }

    const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
    const rawBuffer = await fs.readFile(absPath);
    const fullText = (ext === 'pdf')
      ? this.extractTextFromPdfBuffer(rawBuffer)
      : (ext === 'docx')
      ? this.extractTextFromDocxBuffer(rawBuffer)
      : rawBuffer.toString('utf8');

    const PAGE_CHAR_SIZE = 1800;
    const totalPages = Math.max(1, Math.ceil(fullText.length / PAGE_CHAR_SIZE));
    const matches: Array<{ page: number; snippet: string }> = [];

    const lowerQuery = query.toLowerCase();
    let pos = 0;
    while ((pos = fullText.toLowerCase().indexOf(lowerQuery, pos)) !== -1) {
      const page = Math.floor(pos / PAGE_CHAR_SIZE) + 1;
      const snippetStart = Math.max(0, pos - 60);
      const snippetEnd = Math.min(fullText.length, pos + query.length + 60);
      const snippet = fullText.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ');

      if (!matches.some((m) => m.page === page && m.snippet === snippet)) {
        matches.push({ page, snippet: `...${snippet}...` });
      }

      pos += query.length;
      if (matches.length >= 10) break;
    }

    return {
      success: true,
      filePath,
      query,
      matches,
    };
  }

  static async getDocumentStructure(filePath: string): Promise<DocumentStructure> {
    const absPath = WorkspaceContext.resolvePath(filePath);
    if (!fsSync.existsSync(absPath)) {
      throw new Error(`Document file not found: ${filePath}`);
    }

    const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
    const rawBuffer = await fs.readFile(absPath);
    let fullText = '';

    if (ext === 'pdf') {
      fullText = this.extractTextFromPdfBuffer(rawBuffer);
    } else if (ext === 'docx') {
      fullText = this.extractTextFromDocxBuffer(rawBuffer);
    } else {
      fullText = rawBuffer.toString('utf8');
    }

    const lines = fullText.split('\n');
    const sections: DocumentSection[] = [];
    let currentTitle = 'Introduction';
    let currentContent: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(?:#{1,3}\s+|[A-Z0-9.\s]{3,30}:)\s*(.*)/);
      if (headingMatch && headingMatch[1].trim()) {
        if (currentContent.length > 0) {
          sections.push({
            title: currentTitle,
            content: currentContent.join('\n').slice(0, 500),
          });
          currentContent = [];
        }
        currentTitle = headingMatch[1].trim();
      } else {
        if (currentContent.length < 15) {
          currentContent.push(line);
        }
      }
    }

    if (currentContent.length > 0) {
      sections.push({
        title: currentTitle,
        content: currentContent.join('\n').slice(0, 500),
      });
    }

    return {
      success: true,
      filePath,
      format: ext.toUpperCase(),
      totalLength: fullText.length,
      pageCount: Math.max(1, Math.ceil(fullText.length / 1800)),
      sections: sections.slice(0, 15),
    };
  }

  // --- Safe Binary/Format Text Extractors ---
  private static extractTextFromPdfBuffer(buffer: Buffer): string {
    const raw = buffer.toString('binary');
    const textPieces: string[] = [];
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;

    while ((match = streamRegex.exec(raw)) !== null) {
      const streamContent = match[1];
      const textMatches = streamContent.match(/\(([^()]+)\)\s*Tj/g);
      if (textMatches) {
        for (const tm of textMatches) {
          const t = tm.replace(/^\(/, '').replace(/\)\s*Tj$/, '').trim();
          if (t) textPieces.push(t);
        }
      }
    }

    if (textPieces.length > 0) {
      return textPieces.join(' ');
    }

    // Fallback: extract ASCII printable words
    const printable = buffer.toString('utf8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
    return printable.replace(/\s{2,}/g, ' ').slice(0, 20000);
  }

  private static extractTextFromDocxBuffer(buffer: Buffer): string {
    const raw = buffer.toString('utf8');
    // Extract XML tags <w:t>...</w:t>
    const textMatches = raw.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (textMatches) {
      return textMatches.map((m) => m.replace(/<[^>]+>/g, '')).join(' ');
    }
    return raw.replace(/<[^>]+>/g, ' ').replace(/[^\x20-\x7E\n]/g, ' ').slice(0, 20000);
  }

  private static extractTextFromSpreadsheetBuffer(buffer: Buffer): string {
    const raw = buffer.toString('utf8');
    const matches = raw.match(/<t[^>]*>([^<]+)<\/t>/g) || raw.match(/<v>([^<]+)<\/v>/g);
    if (matches) {
      return matches.map((m) => m.replace(/<[^>]+>/g, '')).join(', ');
    }
    return raw.replace(/<[^>]+>/g, ' ').slice(0, 10000);
  }
}

export const documentService = DocumentService;
