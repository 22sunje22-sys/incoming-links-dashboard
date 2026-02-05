// Vercel Serverless Function - Mark Done API
// Marks a link as done with timestamp

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Missing id parameter' });
  }

  try {
    const timestamp = new Date().toISOString();
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/incoming_links?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ done: timestamp })
    });

    if (!response.ok) {
      throw new Error('Failed to update record');
    }

    res.status(200).json({ success: true, timestamp });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
