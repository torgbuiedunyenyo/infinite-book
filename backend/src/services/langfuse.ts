/**
 * Langfuse Service: LLM observability and evaluation infrastructure.
 * 
 * Provides tracing for all LLM calls and scoring infrastructure for evaluations.
 * 
 * Configuration via environment variables:
 * - LANGFUSE_SECRET_KEY
 * - LANGFUSE_PUBLIC_KEY  
 * - LANGFUSE_BASE_URL (defaults to https://us.cloud.langfuse.com)
 */

import { Langfuse } from 'langfuse';
import { createLogger } from './logger';

const log = createLogger('langfuse');

// Initialize Langfuse client
export const langfuse = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL || 'https://us.cloud.langfuse.com',
});

// Log initialization status
if (process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY) {
  log.info('Langfuse initialized', {
    baseUrl: process.env.LANGFUSE_BASE_URL || 'https://us.cloud.langfuse.com',
    publicKeyPrefix: process.env.LANGFUSE_PUBLIC_KEY?.slice(0, 12) + '...',
  });
} else {
  log.warn('Langfuse not configured - tracing and evaluation disabled', {
    hasSecretKey: !!process.env.LANGFUSE_SECRET_KEY,
    hasPublicKey: !!process.env.LANGFUSE_PUBLIC_KEY,
  });
}

/**
 * Check if Langfuse is properly configured
 */
export function isLangfuseEnabled(): boolean {
  return !!(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY);
}

/**
 * Flush all pending events to Langfuse.
 * Call this before process exit to ensure all data is sent.
 */
export async function flushLangfuse(): Promise<void> {
  if (isLangfuseEnabled()) {
    log.debug('Flushing Langfuse events');
    await langfuse.flushAsync();
  }
}

/**
 * Shutdown Langfuse client gracefully.
 * Flushes pending events and closes connections.
 */
export async function shutdownLangfuse(): Promise<void> {
  if (isLangfuseEnabled()) {
    log.info('Shutting down Langfuse client');
    await langfuse.shutdownAsync();
  }
}

// Ensure traces are flushed on process exit
process.on('beforeExit', async () => {
  await shutdownLangfuse();
});

// Handle SIGINT/SIGTERM gracefully
process.on('SIGINT', async () => {
  await shutdownLangfuse();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdownLangfuse();
  process.exit(0);
});

