import { RecognitionProvider, RecognitionResult } from './types.ts';
import { GeminiRecognitionProvider } from './geminiProvider.ts';

export class RecognitionProviderAdapter {
  private activeProvider: RecognitionProvider;

  constructor(provider?: RecognitionProvider) {
    this.activeProvider = provider || new GeminiRecognitionProvider();
  }

  setProvider(provider: RecognitionProvider) {
    this.activeProvider = provider;
  }

  async recognizeScoresheet(imageBuffer: Buffer, mimeType: string): Promise<RecognitionResult> {
    return this.activeProvider.recognizeScoresheet(imageBuffer, mimeType);
  }
}

// Global default adapter instance
export const defaultRecognitionAdapter = new RecognitionProviderAdapter();
