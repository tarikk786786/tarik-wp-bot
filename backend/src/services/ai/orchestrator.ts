import { aiRouter, AIProvider } from './router.js';
import { memoryManager } from './memory.js';
import { ContactProfile } from '../../models/ContactProfile.js';
import { Conversation } from '../../models/Conversation.js';
import { logger } from '../../utils/logger.js';
import { getSystemPrompt } from '../../../server/services/config.js';
import { emitAiInvocation, emitPendingApproval, incrementMessagesProcessed, backendEvents } from '../../../server/services/socket.js';
import crypto from 'crypto';

class AIOrchestrator {
  private pendingRequests: Map<string, (result: { approved: boolean, text?: string }) => void> = new Map();

  constructor() {
    this.setupSocketListeners();
  }

  private setupSocketListeners() {
    backendEvents.on('approve', ({ id, customReply }) => {
      logger.info(`Dashboard approved message id ${id}`);
      const resolver = this.pendingRequests.get(id);
      if (resolver) {
        resolver({ approved: true, text: customReply });
        this.pendingRequests.delete(id);
      }
    });

    backendEvents.on('reject', ({ id }) => {
      logger.info(`Dashboard rejected message id ${id}`);
      const resolver = this.pendingRequests.get(id);
      if (resolver) {
        resolver({ approved: false });
        this.pendingRequests.delete(id);
      }
    });
  }

  public async handleMessage(phoneNumber: string, jid: string, text: string) {
    try {
      incrementMessagesProcessed();
      
      // 1. Get or create Contact Profile
      let contact = await ContactProfile.findOne({ phoneNumber });
      if (!contact) {
        contact = new ContactProfile({
          phoneNumber,
          tags: ['new_contact']
        });
        await contact.save();
      }

      // If user is in manual mode, AI shouldn't reply autonomously
      if (contact.mode === 'manual') {
        logger.info(`Skipping AI reply for ${phoneNumber} - mode is manual`);
        return null;
      }

      // 2. Save incoming message to Memory
      if (text) {
        await memoryManager.saveMemory(phoneNumber, text, 'user', 5, { jid });
      }

      // 3. Get or create active Conversation
      let conversation = await Conversation.findOne({ 
        contactId: contact._id, 
        status: 'active' 
      });

      if (!conversation) {
        conversation = new Conversation({
          contactId: contact._id,
          messages: []
        });
      }

      // Add user message to conversation history
      conversation.messages.push({
        role: 'human',
        content: text || '[Media Message]',
        timestamp: new Date()
      });

      // Keep context window manageable (last 20 messages)
      if (conversation.messages.length > 20) {
        conversation.messages = conversation.messages.slice(-20);
      }

      // 4. Retrieve semantic memories
      const relevantMemories = await memoryManager.retrieveRelevantMemories(phoneNumber, text);

      // 5. Build prompt
      const basePrompt = getSystemPrompt(phoneNumber);
      const memoryContext = relevantMemories.length > 0 
        ? `\n\nRelevant Past Memories:\n${relevantMemories.join('\n')}`
        : '';
        
      const systemPrompt = `${basePrompt}${memoryContext}`;

      // 6. Generate Response using Router
      // Defaulting to gemini, but can dynamically route based on VIP status
      const provider: AIProvider = contact.isVIP ? 'openai' : 'gemini';
      
      const startTime = Date.now();
      const response = await aiRouter.generateResponse(
        systemPrompt,
        conversation.messages.map(m => ({ role: m.role, content: m.content })),
        provider
      );
      const latency = Date.now() - startTime;
      
      emitAiInvocation("Message Reply Generation", provider, "success", latency);

      // 7. Save AI response
      conversation.messages.push({
        role: 'ai',
        content: response,
        timestamp: new Date()
      });
      await conversation.save();

      await memoryManager.saveMemory(phoneNumber, response, 'system', 5, { jid });

      // If in approval mode, we might want to store this in a pending queue instead of sending
      if (contact.mode === 'approval') {
        logger.info(`Approval mode: Generated response for ${phoneNumber} but not sending automatically.`);
        
        const messageId = crypto.randomUUID();
        
        emitPendingApproval({
          id: messageId,
          sender: phoneNumber,
          time: new Date().toLocaleTimeString(),
          priority: contact.isVIP ? "high" : "medium",
          originalMessage: text,
          proposedReply: response,
          model: provider,
          confidence: Math.floor(Math.random() * (99 - 85 + 1) + 85) // Mock confidence
        });
        
        return new Promise<string | null>((resolve) => {
           this.pendingRequests.set(messageId, (result) => {
             if (!result.approved) {
               resolve(null);
             } else {
               // Use custom reply if provided, otherwise fallback to the originally generated response
               resolve(result.text || response);
             }
           });
        });
      }

      return response;
    } catch (error) {
      logger.error('Orchestrator Error:', error);
      emitAiInvocation("Message Reply Generation", "system", "error", 0);
      return "I'm having a little trouble thinking right now. Could you give me a moment?";
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();
