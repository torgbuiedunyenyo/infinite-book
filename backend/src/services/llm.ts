import Anthropic from '@anthropic-ai/sdk';
import { GenerationContext } from '../types';
import { buildPrompt, SYSTEM_PROMPT } from '../prompts/templates';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generatePageContent(context: GenerationContext): Promise<string> {
  const prompt = buildPrompt(context);

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5-20251101',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    thinking: {
      type: 'enabled',
      budget_tokens: 10000,
    },
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in LLM response');
  }

  return textBlock.text;
}

export async function* streamPageContent(
  context: GenerationContext
): AsyncGenerator<string, void, unknown> {
  const prompt = buildPrompt(context);

  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-5-20251101',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    thinking: {
      type: 'enabled',
      budget_tokens: 10000,
    },
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
