// Vercel Serverless Function - Regions API
// Fetches distinct regions for the country filter

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  try {
    const url = `${SUPABASE_URL}/rest/v1/incoming_links?select=region,region_emoji&order=region.asc`;

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Range': '0-9999'
      }
    });

    const data = await response.json();

    // Extract unique regions
    const regionMap = new Map();
    for (const row of data) {
      if (row.region && row.region.trim()) {
        const key = row.region.trim();
        if (!regionMap.has(key)) {
          regionMap.set(key, row.region_emoji || '');
        }
      }
    }

    const regions = Array.from(regionMap.entries())
      .map(([name, emoji]) => ({ name, emoji }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({ regions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
