// Vercel Serverless Function - Flag Issue API
// Submits feedback and marks link as flagged

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

  const { link_id, feedback_text, feedback_type } = req.body;

  if (!link_id || !feedback_text) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // Insert feedback into relevance_feedback table
    const feedbackResponse = await fetch(`${SUPABASE_URL}/rest/v1/relevance_feedback`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        link_id: link_id,
        feedback_text: feedback_text,
        feedback_type: feedback_type || 'issue'
      })
    });

    if (!feedbackResponse.ok) {
      throw new Error('Failed to insert feedback');
    }

    // Mark the link as flagged
    const flagResponse = await fetch(`${SUPABASE_URL}/rest/v1/incoming_links?id=eq.${link_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ flagged: true })
    });

    if (!flagResponse.ok) {
      throw new Error('Failed to flag link');
    }

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
