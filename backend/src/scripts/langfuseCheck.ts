#!/usr/bin/env npx ts-node
/**
 * Langfuse Setup Verification Script
 * 
 * Checks that Langfuse is properly configured and can communicate with the API.
 * Also shows recent traces and scores if any exist.
 */

import 'dotenv/config';

// Check environment variables first
console.log('=====================================');
console.log('  LANGFUSE SETUP VERIFICATION');
console.log('=====================================\n');

console.log('1. ENVIRONMENT VARIABLES\n');

const secretKey = process.env.LANGFUSE_SECRET_KEY;
const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://us.cloud.langfuse.com';

console.log(`  LANGFUSE_SECRET_KEY: ${secretKey ? `${secretKey.slice(0, 12)}...${secretKey.slice(-4)}` : '❌ NOT SET'}`);
console.log(`  LANGFUSE_PUBLIC_KEY: ${publicKey ? `${publicKey.slice(0, 12)}...${publicKey.slice(-4)}` : '❌ NOT SET'}`);
console.log(`  LANGFUSE_BASE_URL:   ${baseUrl}`);
console.log('');

if (!secretKey || !publicKey) {
  console.error('❌ ERROR: Langfuse keys not configured!');
  console.error('   Add LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY to your .env file');
  process.exit(1);
}

console.log('  ✓ Environment variables configured\n');

// Now import Langfuse (after dotenv is loaded)
import { Langfuse } from 'langfuse';

async function main() {
  console.log('2. LANGFUSE CONNECTION TEST\n');
  
  const langfuse = new Langfuse({
    secretKey,
    publicKey,
    baseUrl,
  });

  try {
    // Create a test trace to verify connection
    console.log('  Creating test trace...');
    
    const trace = langfuse.trace({
      name: 'setup-verification-test',
      metadata: {
        test: true,
        timestamp: new Date().toISOString(),
      },
      tags: ['verification', 'test'],
    });

    // Add a test score
    langfuse.score({
      traceId: trace.id,
      name: 'test_score',
      value: 1,
      comment: 'Setup verification test score',
    });

    // Flush to ensure data is sent
    await langfuse.flushAsync();
    
    console.log(`  ✓ Test trace created: ${trace.id}`);
    console.log('  ✓ Test score attached\n');
    
    console.log('3. API CONNECTIVITY\n');
    
    // Try to fetch traces via the API
    const apiUrl = `${baseUrl}/api/public/traces?limit=5`;
    console.log(`  Fetching recent traces from API...`);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json() as { data?: Array<{ id: string; name: string; timestamp: string; metadata?: { seed?: string; pageNumber?: number } }> };
      console.log(`  ✓ API connection successful\n`);
      
      console.log('4. RECENT TRACES\n');
      
      if (data.data && data.data.length > 0) {
        console.log(`  Found ${data.data.length} recent traces:\n`);
        
        for (const trace of data.data.slice(0, 5)) {
          const time = new Date(trace.timestamp).toLocaleString();
          console.log(`  • ${trace.name}`);
          console.log(`    ID: ${trace.id}`);
          console.log(`    Time: ${time}`);
          if (trace.metadata?.seed) {
            console.log(`    Seed: ${trace.metadata.seed}, Page: ${trace.metadata.pageNumber}`);
          }
          console.log('');
        }
      } else {
        console.log('  No traces found yet. Generate some pages to create traces!\n');
      }
      
      // Try to fetch scores
      console.log('5. RECENT SCORES\n');
      
      const scoresUrl = `${baseUrl}/api/public/scores?limit=10`;
      const scoresResponse = await fetch(scoresUrl, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (scoresResponse.ok) {
        const scoresData = await scoresResponse.json() as { data?: Array<{ name: string; value: number }> };
        
        if (scoresData.data && scoresData.data.length > 0) {
          // Group scores by name
          const scoresByName: Record<string, number[]> = {};
          for (const score of scoresData.data) {
            if (!scoresByName[score.name]) {
              scoresByName[score.name] = [];
            }
            scoresByName[score.name].push(score.value);
          }
          
          console.log(`  Found scores for ${Object.keys(scoresByName).length} evaluation types:\n`);
          
          for (const [name, values] of Object.entries(scoresByName)) {
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            console.log(`  • ${name}`);
            console.log(`    Count: ${values.length}, Average: ${avg.toFixed(3)}`);
          }
          console.log('');
        } else {
          console.log('  No scores found yet. Run evaluations to create scores!\n');
        }
      }
      
    } else {
      console.log(`  ❌ API request failed: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.log(`  Error: ${errorText.slice(0, 200)}`);
    }

    console.log('=====================================');
    console.log('  VERIFICATION COMPLETE');
    console.log('=====================================\n');
    
    console.log('Dashboard URL:');
    console.log(`  ${baseUrl}\n`);
    
    console.log('Next steps:');
    console.log('  1. Generate a page to see real traces');
    console.log('  2. Run batch evaluation: npx ts-node src/scripts/batchEvaluate.ts --limit 1');
    console.log('  3. Check the Langfuse dashboard for results\n');

    await langfuse.shutdownAsync();
    
  } catch (error) {
    console.error('❌ ERROR:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();

