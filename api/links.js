// Vercel Serverless Function - Links API
// Fetches links with filters and pagination

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
    tab = 'all',
    page = 0,
    limit = 20,
    relevance,
    dateFrom,
    dateTo,
    mode = 'workspace'
  } = req.query;

  try {
    let url = `${SUPABASE_URL}/rest/v1/incoming_links?select=*`;
    let filters = [];

    if (mode === 'workspace') {
      if (tab === 'done') {
        filters.push('done=not.is.null');
        filters.push('done=neq.');
      } else if (tab === 'flagged') {
        filters.push('flagged=eq.true');
      } else {
        filters.push('or=(done.is.null,done.eq.)');
      }
    }

    if (relevance === 'high') {
      filters.push('relevance=ilike.*high*')
    } else if (relevance === 'high-medium') {
            filters.push('or=(relevance.ilike.*high*,relevance.ilike.*medium*)');
    } else if (relevance === 'medium') {
      filters.push('relevance=ilike.*medium*');
    } else if (relevance === 'low') {
      filters.push('relevance=ilike.*low*');
    }

    if (dateFrom) {
      filters.push(`uploaded_at=gte.${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      filters.push(`uploaded_at=lte.${dateTo}T23:59:59`);
    }

    if (filters.length > 0) {
      url += '&' + filters.join('&');
    }

    url += '&order=uploaded_at.desc';

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
