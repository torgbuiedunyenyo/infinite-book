import Anthropic from '@anthropic-ai/sdk';
import { GenerationContext } from '../types';
import { buildPrompt, SYSTEM_PROMPT } from '../prompts/templates';
import { llmLogger } from './logger';

const log = llmLogger;

// Track LLM usage statistics
let totalRequests = 0;
let totalInputTokens = 0;
let totalOutputTokens = 0;
let totalThinkingTokens = 0;
let totalLatency = 0;
let streamingRequests = 0;
let nonStreamingRequests = 0;

log.info('Initializing Anthropic client', {
  apiKeySet: !!process.env.ANTHROPIC_API_KEY,
  apiKeyPrefix: process.env.ANTHROPIC_API_KEY?.slice(0, 10) + '...',
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-opus-4-5-20251101';
const MAX_TOKENS = 64000;
const THINKING_BUDGET = 15000;

export async function generatePageContent(context: GenerationContext): Promise<string> {
  // Must use streaming internally because extended thinking can exceed 10-minute timeout
  const requestId = ++totalRequests;
  nonStreamingRequests++;
  
  log.separator(`LLM REQUEST #${requestId} (streaming-collect)`);
  
  const prompt = buildPrompt(context);
  
  log.info(`Request #${requestId}: Building prompt for page generation`, {
    seed: context.seed,
    pageNumber: context.pageNumber,
    hasPrevPages: context.prevPages.length > 0,
    hasReferrerContext: !!context.referrerContext,
    prevPageNumbers: context.prevPages.map((p: { pageNumber: number }) => p.pageNumber),
  });
  
  log.debug(`Request #${requestId}: Prompt details`, {
    promptLength: prompt.length,
    systemPromptLength: SYSTEM_PROMPT.length,
    promptPreview: prompt.slice(0, 500) + '...',
  });
  
  log.info(`Request #${requestId}: Calling Claude API (streaming-collect mode)`, {
    model: MODEL,
    maxTokens: MAX_TOKENS,
    thinkingBudget: THINKING_BUDGET,
  });
  
  const startTime = performance.now();
  let collectedText = '';
  let thinkingChars = 0;
  let chunkCount = 0;
  
  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      thinking: {
        type: 'enabled',
        budget_tokens: THINKING_BUDGET,
      },
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    
    // Iterate through stream events and collect text
    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'thinking_delta') {
          const thinkingText = (event.delta as any).thinking || '';
          thinkingChars += thinkingText.length;
        } else if (event.delta.type === 'text_delta') {
          chunkCount++;
          collectedText += event.delta.text;
        }
      }
    }
    
    const latency = performance.now() - startTime;
    totalLatency += latency;
    
    if (collectedText.length === 0) {
      log.error(`Request #${requestId}: No text content collected from stream`, {
        thinkingChars,
        chunkCount,
      });
      throw new Error('No text content in LLM response');
    }
    
    log.info(`Request #${requestId}: Response collected`, {
      latency: `${latency.toFixed(2)}ms`,
      textLength: collectedText.length,
      thinkingChars,
      chunkCount,
      wordCount: collectedText.split(/\s+/).length,
      textPreview: collectedText.slice(0, 200) + '...',
    });
    
    log.debug(`Request #${requestId}: Cumulative LLM stats`, {
      totalRequests,
      nonStreamingRequests,
      streamingRequests,
      totalInputTokens,
      totalOutputTokens,
      avgLatency: `${(totalLatency / totalRequests).toFixed(2)}ms`,
    });

    return collectedText;
  } catch (error) {
    const latency = performance.now() - startTime;
    log.error(`Request #${requestId}: API call failed`, {
      latency: `${latency.toFixed(2)}ms`,
      collectedSoFar: collectedText.length,
      chunkCount,
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    throw error;
  }
}

export async function* streamPageContent(
  context: GenerationContext
): AsyncGenerator<string, void, unknown> {
  const requestId = ++totalRequests;
  streamingRequests++;
  
  log.separator(`LLM STREAMING REQUEST #${requestId}`);
  
  const prompt = buildPrompt(context);
  
  log.info(`Stream #${requestId}: Building prompt for streaming generation`, {
    seed: context.seed,
    pageNumber: context.pageNumber,
    hasPrevPages: context.prevPages.length > 0,
    hasReferrerContext: !!context.referrerContext,
    prevPageNumbers: context.prevPages.map((p: { pageNumber: number }) => p.pageNumber),
    referrerSeed: context.referrerContext?.seed,
  });
  
  log.debug(`Stream #${requestId}: Full prompt`, {
    promptLength: prompt.length,
    prompt: prompt,
  });
  
  log.info(`Stream #${requestId}: Starting stream`, {
    model: MODEL,
    maxTokens: MAX_TOKENS,
    thinkingBudget: THINKING_BUDGET,
  });
  
  const startTime = performance.now();
  let chunkCount = 0;
  let totalChars = 0;
  let isInThinking = false;
  let thinkingChars = 0;
  let textChars = 0;
  let firstChunkTime: number | null = null;
  
  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      thinking: {
        type: 'enabled',
        budget_tokens: THINKING_BUDGET,
      },
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    for await (const event of stream) {
      if (event.type === 'message_start') {
        log.debug(`Stream #${requestId}: Message started`, {
          messageId: (event as any).message?.id,
        });
      } else if (event.type === 'content_block_start') {
        const blockType = (event as any).content_block?.type;
        log.debug(`Stream #${requestId}: Content block started`, {
          index: (event as any).index,
          type: blockType,
        });
        if (blockType === 'thinking') {
          isInThinking = true;
        } else if (blockType === 'text') {
          isInThinking = false;
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'thinking_delta') {
          const thinkingText = (event.delta as any).thinking || '';
          thinkingChars += thinkingText.length;
          // Don't log every thinking chunk, just track it
          if (thinkingChars % 1000 < 100) {
            log.debug(`Stream #${requestId}: Thinking in progress`, {
              thinkingChars,
            });
          }
        } else if (event.delta.type === 'text_delta') {
          chunkCount++;
          const text = event.delta.text;
          textChars += text.length;
          totalChars += text.length;
          
          if (firstChunkTime === null) {
            firstChunkTime = performance.now() - startTime;
            log.info(`Stream #${requestId}: First text chunk received`, {
              timeToFirstChunk: `${firstChunkTime.toFixed(2)}ms`,
              chunkLength: text.length,
            });
          }
          
          // Log every 10th chunk to avoid spam
          if (chunkCount % 10 === 0) {
            log.debug(`Stream #${requestId}: Streaming progress`, {
              chunkCount,
              totalChars: textChars,
              latestChunk: text.slice(0, 50),
            });
          }
          
          yield text;
        }
      } else if (event.type === 'content_block_stop') {
        log.debug(`Stream #${requestId}: Content block stopped`, {
          index: (event as any).index,
        });
      } else if (event.type === 'message_delta') {
        log.debug(`Stream #${requestId}: Message delta`, {
          stopReason: (event as any).delta?.stop_reason,
          usage: (event as any).usage,
        });
      } else if (event.type === 'message_stop') {
        log.debug(`Stream #${requestId}: Message stopped`);
      }
    }
    
    const totalLatencyMs = performance.now() - startTime;
    totalLatency += totalLatencyMs;
    
    log.info(`Stream #${requestId}: Stream completed`, {
      totalLatency: `${totalLatencyMs.toFixed(2)}ms`,
      timeToFirstChunk: firstChunkTime ? `${firstChunkTime.toFixed(2)}ms` : 'N/A',
      totalChunks: chunkCount,
      thinkingChars,
      textChars,
      avgChunkSize: chunkCount > 0 ? (textChars / chunkCount).toFixed(1) : 0,
    });
    
    log.debug(`Stream #${requestId}: Cumulative LLM stats`, {
      totalRequests,
      nonStreamingRequests,
      streamingRequests,
      totalInputTokens,
      totalOutputTokens,
      avgLatency: `${(totalLatency / totalRequests).toFixed(2)}ms`,
    });
    
  } catch (error) {
    const latency = performance.now() - startTime;
    log.error(`Stream #${requestId}: Stream failed`, {
      latency: `${latency.toFixed(2)}ms`,
      chunksReceivedBeforeError: chunkCount,
      charsReceivedBeforeError: totalChars,
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    throw error;
  }
}

// Export LLM stats for monitoring
export function getLLMStats() {
  return {
    totalRequests,
    nonStreamingRequests,
    streamingRequests,
    totalInputTokens,
    totalOutputTokens,
    totalThinkingTokens,
    totalLatency: `${totalLatency.toFixed(2)}ms`,
    avgLatency: totalRequests > 0 ? `${(totalLatency / totalRequests).toFixed(2)}ms` : '0ms',
  };
}
