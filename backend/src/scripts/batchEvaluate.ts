#!/usr/bin/env npx ts-node
/**
 * Batch Evaluation Script
 * 
 * Evaluates existing pages in the database using Langfuse.
 * Can run all evaluations or specific subsets.
 * 
 * Usage:
 *   npx ts-node src/scripts/batchEvaluate.ts                    # Evaluate all pages
 *   npx ts-node src/scripts/batchEvaluate.ts --seed "The Shape" # Evaluate specific book
 *   npx ts-node src/scripts/batchEvaluate.ts --discrete-only    # Only discrete evals
 *   npx ts-node src/scripts/batchEvaluate.ts --qualitative-only # Only qualitative evals
 *   npx ts-node src/scripts/batchEvaluate.ts --limit 10         # Limit to N pages
 *   npx ts-node src/scripts/batchEvaluate.ts --evals showDontTell,forwardMomentum  # Specific evals
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { Page } from '../types';
import { langfuse, isLangfuseEnabled, shutdownLangfuse } from '../services/langfuse';
import { 
  evaluatePage, 
  DISCRETE_EVALUATIONS, 
  QUALITATIVE_EVALUATIONS,
  getEvaluationStats 
} from '../services/evaluationService';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ==================== DATABASE QUERIES ====================

interface PageRow {
  id: number;
  seed: string;
  page_number: number;
  content: string;
  opening: string;
  closing: string;
  references: any;
  discovered_at: Date;
}

async function getAllPages(options: {
  seed?: string;
  limit?: number;
  offset?: number;
}): Promise<Page[]> {
  const { seed, limit, offset } = options;
  
  let query = `
    SELECT id, seed, page_number, content, opening, closing, "references", discovered_at
    FROM pages
  `;
  const params: any[] = [];
  
  if (seed) {
    query += ` WHERE seed ILIKE $1`;
    params.push(`%${seed}%`);
  }
  
  query += ` ORDER BY seed, page_number`;
  
  if (limit) {
    query += ` LIMIT $${params.length + 1}`;
    params.push(limit);
  }
  
  if (offset) {
    query += ` OFFSET $${params.length + 1}`;
    params.push(offset);
  }
  
  const result = await pool.query(query, params);
  
  return result.rows.map((row: PageRow) => ({
    id: row.id,
    seed: row.seed,
    pageNumber: row.page_number,
    content: row.content,
    opening: row.opening,
    closing: row.closing,
    references: row.references || [],
    discoveredAt: row.discovered_at,
  }));
}

async function getPageCount(seed?: string): Promise<number> {
  let query = `SELECT COUNT(*) as count FROM pages`;
  const params: any[] = [];
  
  if (seed) {
    query += ` WHERE seed ILIKE $1`;
    params.push(`%${seed}%`);
  }
  
  const result = await pool.query(query, params);
  return parseInt(result.rows[0].count, 10);
}

async function getBookArcForSeed(seed: string): Promise<{ narrativeMode?: string } | null> {
  const result = await pool.query(
    `SELECT narrative_mode FROM book_narrative_arcs WHERE seed = $1`,
    [seed]
  );
  
  if (result.rows.length === 0) return null;
  return { narrativeMode: result.rows[0].narrative_mode };
}

// ==================== CLI ARGUMENT PARSING ====================

interface CLIArgs {
  seed?: string;
  limit?: number;
  discreteOnly: boolean;
  qualitativeOnly: boolean;
  evals?: string[];
  help: boolean;
}

function parseArgs(): CLIArgs {
  const args: CLIArgs = {
    discreteOnly: false,
    qualitativeOnly: false,
    help: false,
  };
  
  const argv = process.argv.slice(2);
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--seed' || arg === '-s') {
      args.seed = argv[++i];
    } else if (arg === '--limit' || arg === '-l') {
      args.limit = parseInt(argv[++i], 10);
    } else if (arg === '--discrete-only') {
      args.discreteOnly = true;
    } else if (arg === '--qualitative-only') {
      args.qualitativeOnly = true;
    } else if (arg === '--evals' || arg === '-e') {
      args.evals = argv[++i].split(',').map(e => e.trim());
    }
  }
  
  return args;
}

function printHelp(): void {
  console.log(`
Batch Evaluation Script - Evaluate existing pages with Langfuse

USAGE:
  npx ts-node src/scripts/batchEvaluate.ts [OPTIONS]

OPTIONS:
  -h, --help              Show this help message
  -s, --seed <pattern>    Only evaluate pages matching this seed pattern
  -l, --limit <n>         Limit to N pages
  --discrete-only         Only run discrete evaluations (fast, no LLM calls)
  --qualitative-only      Only run qualitative evaluations (LLM-as-judge)
  -e, --evals <list>      Comma-separated list of specific evaluations to run

AVAILABLE DISCRETE EVALUATIONS:
${Object.entries(DISCRETE_EVALUATIONS).map(([key, e]) => `  - ${key}: ${e.description}`).join('\n')}

AVAILABLE QUALITATIVE EVALUATIONS:
${Object.entries(QUALITATIVE_EVALUATIONS).map(([key, e]) => `  - ${key}: ${e.description}`).join('\n')}

EXAMPLES:
  # Evaluate all pages (full suite)
  npx ts-node src/scripts/batchEvaluate.ts

  # Evaluate only "The Shape of Time" book
  npx ts-node src/scripts/batchEvaluate.ts --seed "The Shape of Time"

  # Quick discrete-only evaluation
  npx ts-node src/scripts/batchEvaluate.ts --discrete-only

  # Specific qualitative evaluations
  npx ts-node src/scripts/batchEvaluate.ts --evals showDontTell,forwardMomentum

  # Evaluate first 5 pages only
  npx ts-node src/scripts/batchEvaluate.ts --limit 5
`);
}

// ==================== MAIN EXECUTION ====================

async function main(): Promise<void> {
  const args = parseArgs();
  
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  
  // Check Langfuse is configured
  if (!isLangfuseEnabled()) {
    console.error('ERROR: Langfuse is not configured.');
    console.error('Set LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY in your .env file.');
    process.exit(1);
  }
  
  console.log('=====================================');
  console.log('  BATCH EVALUATION SCRIPT');
  console.log('=====================================\n');
  
  // Show configuration
  console.log('Configuration:');
  console.log(`  Seed filter: ${args.seed || 'ALL'}`);
  console.log(`  Limit: ${args.limit || 'NONE'}`);
  console.log(`  Discrete evaluations: ${args.qualitativeOnly ? 'DISABLED' : 'ENABLED'}`);
  console.log(`  Qualitative evaluations: ${args.discreteOnly ? 'DISABLED' : 'ENABLED'}`);
  if (args.evals) {
    console.log(`  Specific evals: ${args.evals.join(', ')}`);
  }
  console.log('');
  
  // Get page count
  const totalPages = await getPageCount(args.seed);
  const pagesToProcess = args.limit ? Math.min(args.limit, totalPages) : totalPages;
  
  console.log(`Found ${totalPages} pages${args.seed ? ` matching "${args.seed}"` : ''}`);
  console.log(`Will evaluate ${pagesToProcess} pages\n`);
  
  if (pagesToProcess === 0) {
    console.log('No pages to evaluate. Exiting.');
    await pool.end();
    return;
  }
  
  // Get pages
  const pages = await getAllPages({
    seed: args.seed,
    limit: args.limit,
  });
  
  // Track progress
  let processed = 0;
  let errors = 0;
  const startTime = Date.now();
  
  console.log('Starting evaluation...\n');
  
  for (const page of pages) {
    processed++;
    const progress = `[${processed}/${pagesToProcess}]`;
    
    try {
      // Create a trace for this historical evaluation
      const trace = langfuse.trace({
        name: 'batch-evaluation',
        metadata: {
          seed: page.seed,
          pageNumber: page.pageNumber,
          batchRun: true,
          runTimestamp: new Date().toISOString(),
        },
        tags: ['batch-evaluation', `page-${page.pageNumber}`],
      });
      
      // Get book arc for narrative mode
      const bookArc = await getBookArcForSeed(page.seed);
      
      // Determine what evaluations to run
      const runDiscrete = !args.qualitativeOnly;
      let runQualitative: boolean | string[] = !args.discreteOnly;
      
      if (args.evals && runQualitative) {
        runQualitative = args.evals;
      }
      
      // Run evaluation
      await evaluatePage(page, trace.id, {
        discrete: runDiscrete,
        qualitative: runQualitative,
        metadata: {
          seed: page.seed,
          pageNumber: page.pageNumber,
          isCoreSeed: page.seed === 'The Shape of Time',
          narrativeMode: bookArc?.narrativeMode,
        },
      });
      
      console.log(`${progress} ✓ ${page.seed} p.${page.pageNumber}`);
    } catch (error) {
      errors++;
      console.error(`${progress} ✗ ${page.seed} p.${page.pageNumber}: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Progress update every 10 pages
    if (processed % 10 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = (pagesToProcess - processed) / rate;
      console.log(`\n  Progress: ${((processed / pagesToProcess) * 100).toFixed(1)}% | Rate: ${rate.toFixed(1)} pages/sec | ETA: ${remaining.toFixed(0)}s\n`);
    }
  }
  
  // Final summary
  const totalTime = (Date.now() - startTime) / 1000;
  
  console.log('\n=====================================');
  console.log('  EVALUATION COMPLETE');
  console.log('=====================================');
  console.log(`  Pages processed: ${processed}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total time: ${totalTime.toFixed(1)}s`);
  console.log(`  Average: ${(totalTime / processed).toFixed(2)}s per page`);
  console.log('=====================================\n');
  
  // Show available evaluations
  const stats = getEvaluationStats();
  console.log('Evaluation types used:');
  console.log(`  Discrete: ${stats.discrete.length}`);
  console.log(`  Qualitative: ${stats.qualitative.length}`);
  console.log('');
  
  console.log('View results in Langfuse dashboard:');
  console.log(`  ${process.env.LANGFUSE_BASE_URL || 'https://us.cloud.langfuse.com'}`);
  
  // Cleanup
  await shutdownLangfuse();
  await pool.end();
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

