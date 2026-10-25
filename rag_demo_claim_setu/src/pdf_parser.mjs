// rag_demo_claim_setu/src/pdf_parser.mjs
import fs from 'fs';
import { PDFParse } from 'pdf-parse';

/**
 * Extracts text and page boundaries from a PDF file
 * @param {string|Buffer|Uint8Array} filePathOrBuffer
 * @returns {Promise<{ rawText: string, totalPages: number, pages: Array<{ pageNumber: number, text: string }> }>}
 */
export async function parsePdf(filePathOrBuffer) {
  let buffer;
  if (typeof filePathOrBuffer === 'string') {
    buffer = fs.readFileSync(filePathOrBuffer);
  } else if (Buffer.isBuffer(filePathOrBuffer)) {
    buffer = filePathOrBuffer;
  } else if (filePathOrBuffer instanceof Uint8Array) {
    buffer = Buffer.from(filePathOrBuffer);
  } else {
    throw new Error('parsePdf expects a file path, Buffer, or Uint8Array');
  }

  const parser = new PDFParse(new Uint8Array(buffer));
  await parser.load();
  const textResult = await parser.getText();
  const rawText = textResult.text || '';
  const totalPages = textResult.total || 1;

  let pages = [];
  if (/-- \d+ of \d+ --/.test(rawText)) {
    const parts = rawText.split(/-- \d+ of \d+ --\n*/);
    pages = parts
      .map((pText, idx) => ({
        pageNumber: idx + 1,
        text: pText.trim(),
      }))
      .filter((p) => p.text.length > 0);
  } else if (textResult.pages && Array.isArray(textResult.pages) && textResult.pages.length > 0) {
    pages = textResult.pages.map((p, idx) => ({
      pageNumber: idx + 1,
      text: (p.text || '').trim(),
    }));
  } else {
    pages = [
      {
        pageNumber: 1,
        text: rawText.trim(),
      },
    ];
  }

  return {
    rawText,
    totalPages,
    pages,
  };
}

export default { parsePdf };
