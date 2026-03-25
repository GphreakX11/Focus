const https = require('https');

const url = "https://unique-minnow-74355.upstash.io";
const token = "gQAAAAAAASJzAAIncDE0MDgxZjA3YWJiYzU0YmI5YTg2MmNlOWUyMzBhMWZmMHAxNzQzNTU";

async function upstash(command) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(command);
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(JSON.parse(body)));
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('--- CLEANING UP TESTUSER ---');
  const keys = [
    'apex_global_alltime',
    'apex_leaderboard_accuracy',
    'leaderboard_survivalist',
    'leaderboard_clears',
  ];

  for (const key of keys) {
    const members = await upstash(['ZRANGE', key, '0', '-1']);
    if (members.result) {
      const toRemove = members.result.filter(m => m.toLowerCase().startsWith('testuser:'));
      if (toRemove.length > 0) {
        console.log(`Removing from ${key}:`, toRemove);
        await upstash(['ZREM', key, ...toRemove]);
      }
    }
  }

  console.log('--- DEBUGGING KRISTIN ---');
  const allTime = await upstash(['ZRANGE', 'apex_global_alltime', '0', '-1', 'REV']);
  const kristinEntry = allTime.result?.find(m => m.toUpperCase().startsWith('KRISTIN:'));
  
  if (kristinEntry) {
    const pid = kristinEntry.split(':')[1];
    console.log(`KRISTIN PID: ${pid}`);
    const wins = await upstash(['HGET', 'apex_user_daily_wins', pid]);
    console.log(`KRISTIN silverWins in Redis: ${wins.result}`);
  } else {
     console.log('KRISTIN not found in Hall of Fame.');
  }
}

run().catch(console.error);
