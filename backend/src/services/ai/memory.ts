import { Memory } from '../../models/Memory.js';
import { ContactProfile } from '../../models/ContactProfile.js';
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
      const contact = await ContactProfile.findOne({ phoneNumber });
      if (!contact) {
        logger.warn(`Cannot save memory: Contact ${phoneNumber} not found.`);
        return null;
      }

      // Generate embedding vector for the content
      const vector = await this.embeddings.embedQuery(content);

      const memory = new Memory({
        contactId: contact._id,
        content,
        source,
        importance,
        vector,
        metadata: {
          ...metadata,
          timestamp: new Date()
        }
      });

      await memory.save();
      logger.info(`Saved memory for ${phoneNumber}`);
      return memory;
    } catch (error) {
      logger.error(error, 'Failed to save memory:');
      throw error;
    }
  }

  public async retrieveRelevantMemories(phoneNumber: string, query: string, limit: number = 5) {
    try {
      const contact = await ContactProfile.findOne({ phoneNumber });
      if (!contact) return [];

      const queryVector = await this.embeddings.embedQuery(query);

      // In a real MongoDB Atlas environment, you would use $vectorSearch here.
      // Since this is a standard mongoose model fallback, we can fetch all memories
      // and do a cosine similarity in memory, or just return recent memories if $vectorSearch isn't setup.
      
      // For now, returning the most recent important memories
      // (Vector Search requires Atlas indexing which must be setup in the MongoDB dashboard)
      const memories = await Memory.find({ contactId: contact._id })
        .sort({ importance: -1, createdAt: -1 })
        .limit(limit);

      return memories.map(m => m.content);
    } catch (error) {
      logger.error(error, 'Failed to retrieve memories:');
      return [];
    }
  }
}

export const memoryManager = new MemoryManager();
