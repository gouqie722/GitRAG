import OpenAI from 'openai';
import { config } from '../config.js';

const deepseek = new OpenAI({
  apiKey: config.deepseek.apiKey,
  baseURL: config.deepseek.baseURL,
});

export async function chatCompletion(messages) {
  if (!config.deepseek.apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const response = await deepseek.chat.completions.create({
    model: config.deepseek.chatModel,
    messages,
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content || '';
}

export async function* chatCompletionStream(messages) {
  if (!config.deepseek.apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const stream = await deepseek.chat.completions.create({
    model: config.deepseek.chatModel,
    messages,
    temperature: 0.3,
    stream: true,
  });

  for await (const part of stream) {
    const delta = part.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
