// Vercel Serverless Function - Stats API
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  const { type, dateFrom, dateTo } = req.query;
  
  try {
    let url = SUPABASE_URL + '/rest/v1/incoming_links?select=id';
    let filters = [];
    if (dateFrom) filters.push('uploaded_at=gte.' + dateFrom + 'T00:00:00');
    if (dateTo) filters.push('uploaded_at=lte.' + dateTo + 'T23:59:59');
    if (type === 'high') filters.push('relevance=ilike.*high*');
    else if (type === 'medium') filters.push('relevance=ilike.*medium*');
    else if (type === 'low') filters.push('relevance=ilike.*low*');
    else if (type === 'done') { filters.push('done=not.is.null'); filters.push('done=neq.'); }
    else if (type === 'flagged') filters.push('flagged=eq.true');
    else if (type === 'pending') filters.push('done=is.null');
    else if (type === 'drafts') filters.push('eng_blog_url=not.is.null');
    if (filters.length > 0) url += '&' + filters.join('&');
    
    const response = await fetch(url, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'count=exact', 'Range': '0-0' }
    });
    const contentRange = response.headers.get('content-range');
    let count = 0;
    if (contentRange) { const match = contentRange.match(/\/(\d+)/); if (match) count = parseInt(match[1]); }
    res.status(200).json({ count });
  } catch (error) { res.status(500).json({ error: error.message }); }
}
