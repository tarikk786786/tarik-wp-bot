import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { logger } from '../../utils/logger.js';

export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'openrouter';

export class AIRouter {
  private providers: Map<AIProvider, BaseChatModel> = new Map();

  constructor() {
    this.initProviders();
  }

  private initProviders() {
    if (process.env.GEMINI_API_KEY) {
      this.providers.set('gemini', new ChatGoogleGenerativeAI({
        modelName: 'gemini-2.5-flash',
        apiKey: process.env.GEMINI_API_KEY,
        temperature: 0.7,
      }));
    }

    if (process.env.OPENAI_API_KEY) {
      this.providers.set('openai', new ChatOpenAI({
        modelName: 'gpt-4o',
        apiKey: process.env.OPENAI_API_KEY,
        temperature: 0.7,
      }));
    }

    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.set('anthropic', new ChatAnthropic({
        modelName: 'claude-3-opus-20240229',
        apiKey: process.env.ANTHROPIC_API_KEY,
        temperature: 0.7,
      }));
    }
    
    if (process.env.OPENROUTER_API_KEY) {
      this.providers.set('openrouter', new ChatOpenAI({
        modelName: 'deepseek/deepseek-r1', // Default OpenRouter model example
        apiKey: process.env.OPENROUTER_API_KEY,
        configuration: {
          baseURL: 'https://openrouter.ai/api/v1',
        },
        temperature: 0.7,
      }));
    }
  }

  public getModel(preferredProvider?: AIProvider): BaseChatModel {
    if (preferredProvider && this.providers.has(preferredProvider)) {
      return this.providers.get(preferredProvider)!;
    }

    // Fallback logic
    if (this.providers.has('gemini')) return this.providers.get('gemini')!;
    if (this.providers.has('openai')) return this.providers.get('openai')!;
    if (this.providers.has('anthropic')) return this.providers.get('anthropic')!;
    if (this.providers.has('openrouter')) return this.providers.get('openrouter')!;

    throw new Error('No AI providers configured. Please check environment variables.');
  }

  public async generateResponse(
    systemPrompt: string, 
    messages: { role: string, content: string }[], 
    provider?: AIProvider
  ) {
    const model = this.getModel(provider);
    try {
      const formattedMessages = [
        ['system', systemPrompt],
        ...messages.map(m => [m.role, m.content] as [string, string])
      ];
      
      const response = await model.invoke(formattedMessages);
      return response.content.toString();
    } catch (error) {
      logger.error(`AI generation failed with provider ${provider || 'default'}:`, error);
      throw error;
    }
  }
}

export const aiRouter = new AIRouter();
