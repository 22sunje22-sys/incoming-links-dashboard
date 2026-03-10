// Vercel Serverless Function - Instagram Reels API
// Fetches reels with filters and pagination

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
    limit = 30,
    dateFrom,
    dateTo,
    category,
    search,
    sort = 'added_date',
    dir = 'desc',
    country
  } = req.query;

  try {
    let url = `${SUPABASE_URL}/rest/v1/instagram_reels?select=*`;
    let filters = [];

    if (dateFrom) {
      filters.push(`added_date=gte.${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      filters.push(`added_date=lte.${dateTo}T23:59:59`);
    }

    if (category) {
      filters.push(`category=ilike.*${category}*`);
    }

    if (search) {
      filters.push(`or=(theme.ilike.*${search}*,hook.ilike.*${search}*,content.ilike.*${search}*,account_url.ilike.*${search}*)`);
    }

    if (tab === 'sent') {
      filters.push('sending_done=not.is.null');
      filters.push('sending_done=neq.');
    } else if (tab === 'pending') {
      filters.push('or=(sending_done.is.null,sending_done.eq.)');
    }

    if (country) {
      filters.push(`country=eq.${country}`);
    }

    if (filters.length > 0) {
      url += '&' + filters.join('&');
    }

    // Sorting
    const allowedSorts = ['added_date', 'posted_date', 'views', 'likes', 'comments', 'er_likes_cooments_views', 'virus_detector', 'followers'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'added_date';
    const sortDir = dir === 'asc' ? 'asc' : 'desc';
    url += `&order=${sortCol}.${sortDir}.nullslast`;

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
