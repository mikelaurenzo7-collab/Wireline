import pdf from 'pdf-parse';
import { log } from './server-context';
import { getErrorMessage } from './server-utils';

/**
 * PdfService
 * 
 * Logic for extracting text from PDF files for AI agents.
 */
export const PdfService = {
  /**
   * Extract text from a PDF URL.
   */
  async extractText(url: string): Promise<string> {
    try {
      log.info("Starting PDF extraction", { url });
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF from URL: ${response.statusText}`);
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      const data = await pdf(buffer);
      
      log.info("PDF extraction complete", { characters: data.text.length });
      return data.text;
    } catch (error) {
      log.error("PDF extraction failed", { error: getErrorMessage(error), url });
      return `Error: Could not extract text from PDF. ${getErrorMessage(error)}`;
    }
  }
};
