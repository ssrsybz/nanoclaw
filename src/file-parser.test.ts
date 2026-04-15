import { describe, it, expect } from 'vitest';
import {
  parseFile,
  truncateText,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_TEXT_LENGTH,
} from './file-parser.js';
import XLSX from 'xlsx';

describe('file-parser', () => {
  describe('constants', () => {
    it('ALLOWED_EXTENSIONS contains .docx, .xlsx, .pdf', () => {
      expect(ALLOWED_EXTENSIONS).toContain('.docx');
      expect(ALLOWED_EXTENSIONS).toContain('.xlsx');
      expect(ALLOWED_EXTENSIONS).toContain('.pdf');
      expect(ALLOWED_EXTENSIONS).toHaveLength(3);
    });

    it('MAX_FILE_SIZE is 20MB', () => {
      expect(MAX_FILE_SIZE).toBe(20 * 1024 * 1024);
    });

    it('MAX_TEXT_LENGTH is 50000', () => {
      expect(MAX_TEXT_LENGTH).toBe(50_000);
    });
  });

  describe('truncateText', () => {
    it('returns text unchanged when within limit', () => {
      const text = 'short text';
      expect(truncateText(text)).toBe(text);
    });

    it('truncates text that exceeds MAX_TEXT_LENGTH', () => {
      const longText = 'A'.repeat(MAX_TEXT_LENGTH + 1000);
      const result = truncateText(longText);
      expect(result.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH);
      expect(result).toContain('已截断');
    });

    it('includes filePath in truncation suffix when provided', () => {
      const longText = 'X'.repeat(MAX_TEXT_LENGTH + 500);
      const result = truncateText(longText, '/path/to/file.xlsx');
      expect(result).toContain('/path/to/file.xlsx');
      expect(result).toContain('完整文件已保存至');
      expect(result.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH);
    });

    it('uses generic suffix when no filePath provided', () => {
      const longText = 'B'.repeat(MAX_TEXT_LENGTH + 200);
      const result = truncateText(longText);
      expect(result).toContain('文件内容过长，已截断');
      expect(result).not.toContain('完整文件已保存至');
    });
  });

  describe('parseFile', () => {
    it('rejects unsupported file types', async () => {
      const buffer = Buffer.from('hello');
      await expect(
        parseFile(buffer, 'text/plain', 'readme.txt'),
      ).rejects.toThrow('Unsupported file type');
    });

    it('rejects unsupported extensions regardless of case', async () => {
      const buffer = Buffer.from('hello');
      await expect(
        parseFile(buffer, 'image/png', 'image.PNG'),
      ).rejects.toThrow('Unsupported file type');
    });

    it('rejects files exceeding max size', async () => {
      const buffer = Buffer.alloc(MAX_FILE_SIZE + 1);
      await expect(
        parseFile(buffer, 'application/pdf', 'big.pdf'),
      ).rejects.toThrow('exceeds maximum');
    });

    it('rejects files exceeding max size with correct size in message', async () => {
      const buffer = Buffer.alloc(MAX_FILE_SIZE + 1024 * 1024);
      await expect(
        parseFile(buffer, 'application/pdf', 'big.pdf'),
      ).rejects.toThrow('21.0MB');
    });

    it('parses a small xlsx file in memory', async () => {
      const workbook = XLSX.utils.book_new();
      const sheetData = [
        ['Name', 'Age'],
        ['Alice', 30],
        ['Bob', 25],
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'People');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const result = await parseFile(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'data.xlsx');

      expect(result.text).toContain('--- People ---');
      expect(result.text).toContain('Name');
      expect(result.text).toContain('Alice');
      expect(result.text).toContain('Bob');
      expect(result.sheetCount).toBe(1);
    });

    it('parses xlsx with multiple sheets', async () => {
      const workbook = XLSX.utils.book_new();
      const sheet1 = XLSX.utils.aoa_to_sheet([['A', 'B']]);
      const sheet2 = XLSX.utils.aoa_to_sheet([['C', 'D']]);
      XLSX.utils.book_append_sheet(workbook, sheet1, 'Sheet1');
      XLSX.utils.book_append_sheet(workbook, sheet2, 'Sheet2');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const result = await parseFile(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'multi.xlsx');

      expect(result.text).toContain('--- Sheet1 ---');
      expect(result.text).toContain('--- Sheet2 ---');
      expect(result.sheetCount).toBe(2);
    });

    it('returns error text for corrupted/invalid pdf content', async () => {
      const buffer = Buffer.from('this is not valid pdf data at all');
      const result = await parseFile(buffer, 'application/pdf', 'corrupt.pdf');

      expect(result.text).toContain('文件解析失败');
    });
  });
});
