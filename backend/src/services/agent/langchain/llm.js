import { ChatOpenAI } from '@langchain/openai';
import { config } from '../../../config.js';

let llmInstance = null;

export function getChatModel() {
  if (!llmInstance) {
    if (!config.deepseek.apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

    llmInstance = new ChatOpenAI({
      model: config.deepseek.chatModel,
      apiKey: config.deepseek.apiKey,
      temperature: 0.3,
      streaming: true,
      configuration: {
        baseURL: config.deepseek.baseURL,
      },
    });
  }

  return llmInstance;
}
