// Vercel Serverless Function - Webby Data API
// Fetches memory table with filters and pagination

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  const {
    page = 0,
    limit = 30,
    dateFrom,
    dateTo,
    search,
    country,
    topic
  } = req.query;

  try {
    let url = `${SUPABASE_URL}/rest/v1/memory?select=*`;
    let filters = [];

    if (dateFrom) {
      filters.push(`created_at=gte.${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      filters.push(`created_at=lte.${dateTo}T23:59:59`);
    }

    if (search) {
      filters.push(`or=(row.ilike.*${search}*,keyword.ilike.*${search}*,topic.ilike.*${search}*,link.ilike.*${search}*)`);
    }

    if (topic) {
      filters.push(`topic=ilike.*${topic}*`);
    }

    if (country) {
      if (country === 'gcc_excl_uae') {
        filters.push('country=in.(Bahrain,KSA,Kuwait,Qatar,Oman)');
      } else if (country === 'other') {
        filters.push('or=(country.is.null,country.not.in.(UAE,Bahrain,KSA,Kuwait,Qatar,Oman))');
      } else {
        filters.push(`country=eq.${country}`);
      }
    }

    if (filters.length > 0) {
      url += '&' + filters.join('&');
    }

    url += '&order=created_at.desc';

    const offset = parseInt(page) * parseInt(limit);
    const rangeEnd = offset + parseInt(limit) - 1;

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'count=exact',
        'Range': `${offset}-${rangeEnd}`
      }
    });

    const data = await response.json();
    const contentRange = response.headers.get('content-range');
    let total = 0;
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)/);
      if (match) total = parseInt(match[1]);
    }

    res.status(200).json({ data, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
