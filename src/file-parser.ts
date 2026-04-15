import path from 'path';
import { logger } from './logger.js';

export const ALLOWED_EXTENSIONS = ['.docx', '.xlsx', '.pdf'];
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
export const MAX_TEXT_LENGTH = 50_000;

export interface ParsedFile {
  text: string;
  pageCount?: number;
  sheetCount?: number;
}

export function truncateText(text: string, filePath?: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  const suffix = filePath
    ? `\n\n[文件内容过长，已截断。完整文件已保存至: ${filePath}]`
    : '\n\n[文件内容过长，已截断]';
  return text.slice(0, MAX_TEXT_LENGTH - suffix.length) + suffix;
}

async function parsePdf(buffer: Buffer): Promise<ParsedFile> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  return {
    text: data.text || '',
    pageCount: data.total,
  };
}

async function parseXlsx(buffer: Buffer): Promise<ParsedFile> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`--- ${sheetName} ---\n${csv}`);
  }
  return {
    text: parts.join('\n\n'),
    sheetCount: workbook.SheetNames.length,
  };
}

async function parseDocx(buffer: Buffer): Promise<ParsedFile> {
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToHtml({ buffer });
  const text = result.value
    .replace(/<h[1-6][^>]*>/gi, '\n## ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text };
}

export async function parseFile(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  filePath?: string,
): Promise<ParsedFile> {
  const ext = path.extname(filename).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size (${(buffer.length / 1024 / 1024).toFixed(1)}MB) exceeds maximum (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }

  try {
    let result: ParsedFile;
    switch (ext) {
      case '.pdf':
        result = await parsePdf(buffer);
        break;
      case '.xlsx':
        result = await parseXlsx(buffer);
        break;
      case '.docx':
        result = await parseDocx(buffer);
        break;
      default:
        throw new Error(`No parser for: ${ext}`);
    }

    result.text = truncateText(result.text, filePath);
    return result;
  } catch (err) {
    if (err instanceof Error && (err.message.includes('Unsupported') || err.message.includes('exceeds'))) {
      throw err;
    }
    logger.error({ err, filename }, 'File parsing failed');
    return {
      text: `[文件解析失败: ${err instanceof Error ? err.message : String(err)}]`,
    };
  }
}
