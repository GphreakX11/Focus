import { createClient } from '@vercel/kv';

const kv = createClient({
  url: "https://unique-minnow-74355.upstash.io",
  token: "gQAAAAAAASJzAAIncDE0MDgxZjA3YWJiYzU0YmI5YTg2MmNlOWUyMzBhMWZmMHAxNzQzNTU",
});

async function run() {
  console.log('--- SCRUBBING TEST USER ---');
  const keys = [
    'apex_global_alltime',
    'apex_leaderboard_accuracy',
    'leaderboard_survivalist',
    'leaderboard_clears',
  ];

  for (const key of keys) {
    const members = await kv.zrange(key, 0, -1);
    const toRemove = (members as any[]).filter(m => {
      const s = typeof m === 'string' ? m : (m as any).member;
      if (!s) return false;
      return s.toLowerCase().startsWith('testuser:');
    });

    if (toRemove.length > 0) {
      console.log(`Removing from ${key}:`, toRemove);
      await kv.zrem(key, ...toRemove);
    }
  }

  console.log('--- DEBUGGING KRISTIN ---');
  // Find Kristin in All-Time
  const allTime = await kv.zrange('apex_global_alltime', 0, -1, { rev: true });
  const kristinEntry = (allTime as any[]).find(m => {
    const s = typeof m === 'string' ? m : (m as any).member;
    return s.toUpperCase().startsWith('KRISTIN:');
  });

  if (kristinEntry) {
    const s = typeof kristinEntry === 'string' ? kristinEntry : (kristinEntry as any).member;
    const parts = s.split(':');
    const pid = parts[1];
    console.log(`Found KRISTIN with PID: ${pid}`);
    if (pid) {
      const wins = await kv.hget('apex_user_daily_wins', pid);
      console.log(`KRISTIN's silverWins in Redis: ${wins}`);
    }
  } else {
    console.log('KRISTIN not found in all-time leaderboard.');
  }
}

run().then(() => console.log('Done')).catch(console.error);
