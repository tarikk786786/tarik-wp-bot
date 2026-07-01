import { saveAIMemory, loadAIMemory } from '../../../server/services/db-helpers.js';
import { logger } from '../../utils/logger.js';
// Using Gemini for embeddings as an example, but this can be abstracted later
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

class MemoryManager {
  private embeddings: GoogleGenerativeAIEmbeddings;

  constructor() {
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      modelName: "text-embedding-004", // Latest Gemini embedding model
      apiKey: process.env.GEMINI_API_KEY
    });
  }

  public async saveMemory(
    phoneNumber: string, 
    content: string, 
    source: 'whatsapp' | 'system' | 'user' = 'whatsapp',
    importance: number = 5,
    metadata: any = {}
  ) {
    try {
      // Fetch existing memory to append
      const memoryData = await loadAIMemory(phoneNumber);
      const history = memoryData?.history || [];

      // Generate embedding vector for the content
      let vector = null;
      try {
        vector = await this.embeddings.embedQuery(content);
      } catch (e) {
        logger.warn('Failed to generate embedding, continuing without vector');
      }

      const newMemory = {
        content,
        source,
        importance,
        vector,
        metadata: {
          ...metadata,
          timestamp: new Date()
        }
      };

      history.push(newMemory);

      await saveAIMemory(phoneNumber, history);
      logger.info(`Saved memory for ${phoneNumber}`);
      return newMemory;
    } catch (error) {
      logger.error(error, 'Failed to save memory:');
      throw error;
    }
  }

  public async retrieveRelevantMemories(phoneNumber: string, query: string, limit: number = 5) {
    try {
      const memoryData = await loadAIMemory(phoneNumber);
      if (!memoryData || !memoryData.history) return [];

      let history = memoryData.history;
      
      // Sort by importance and date (newest first)
      history.sort((a: any, b: any) => {
        if (a.importance !== b.importance) {
          return b.importance - a.importance;
        }
        return new Date(b.metadata?.timestamp).getTime() - new Date(a.metadata?.timestamp).getTime();
      });

      return history.slice(0, limit).map((m: any) => m.content);
    } catch (error) {
      logger.error(error, 'Failed to retrieve memories:');
      return [];
    }
  }
}

export const memoryManager = new MemoryManager();
