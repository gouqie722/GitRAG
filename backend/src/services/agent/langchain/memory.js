import { HumanMessage, AIMessage } from '@langchain/core/messages';

export function buildChatHistory(history = [], limit = 10) {
  return history
    .filter((msg) => msg?.content?.trim() && (msg.role === 'user' || msg.role === 'assistant'))
    .slice(-limit)
    .map((msg) =>
      msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
    );
}
