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
    const url = `${SUPABASE_URL}/rest/v1/incoming_links?select=country&order=country.asc`;

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Range': '0-9999'
      }
    });

    const data = await response.json();

    const countrySet = new Set();
    for (const row of data) {
      if (row.country && row.country.trim()) {
        countrySet.add(row.country.trim());
      }
    }

    const emojiMap = { UAE: '🇦🇪', Bahrain: '🇧🇭', KSA: '🇸🇦', Kuwait: '🇰🇼', Qatar: '🇶🇦', Oman: '🇴🇲', India: '🇮🇳' };
    const regions = Array.from(countrySet)
      .map(name => ({ name, emoji: emojiMap[name] || '' }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({ regions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
