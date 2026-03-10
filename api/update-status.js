// Vercel Serverless Function - Update Status API
// Toggles posted_socials / posted_blog for incoming_links or instagram_reels

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

  const { id, table, field, value } = req.body;

  if (!id || !table || !field) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const allowedTables = ['incoming_links', 'instagram_reels', 'social_posts', 'memory'];
  const allowedFields = ['posted_socials', 'posted_blog', 'done'];

  if (!allowedTables.includes(table)) {
    return res.status(400).json({ error: 'Invalid table' });
  }
  if (!allowedFields.includes(field)) {
    return res.status(400).json({ error: 'Invalid field' });
  }

  try {
    const newValue = value ? null : new Date().toISOString();

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ [field]: newValue })
    });

    if (!response.ok) {
      throw new Error('Failed to update record');
    }

    res.status(200).json({ success: true, value: newValue });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
