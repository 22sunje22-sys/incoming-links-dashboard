// Vercel Serverless Function - Daily AI Digest
// GET: fetch stored digest by date
// POST: generate new digest for yesterday

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  // Vercel cron sends GET requests - detect via header or ?generate=true
  const isCron = req.headers['x-vercel-cron'] || req.query.generate === 'true';

  if (req.method === 'GET' && isCron) {
    return handlePost(req, res, SUPABASE_URL, SUPABASE_KEY, OPENAI_API_KEY);
  }

  if (req.method === 'GET') {
    return handleGet(req, res, SUPABASE_URL, SUPABASE_KEY);
  }

  if (req.method === 'POST') {
    return handlePost(req, res, SUPABASE_URL, SUPABASE_KEY, OPENAI_API_KEY);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// GET - fetch digest by date (defaults to yesterday)
async function handleGet(req, res, SUPABASE_URL, SUPABASE_KEY) {
  try {
    const { date } = req.query;
    let url;

    if (date) {
      url = `${SUPABASE_URL}/rest/v1/daily_digest?digest_date=eq.${date}&limit=1`;
    } else {
      url = `${SUPABASE_URL}/rest/v1/daily_digest?order=digest_date.desc&limit=5`;
    }

    const resp = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    const data = await resp.json();
    return res.status(200).json({ data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// POST - generate digest for a specific date or yesterday
async function handlePost(req, res, SUPABASE_URL, SUPABASE_KEY, OPENAI_API_KEY) {
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  }

  try {
    const { date: targetDate } = req.query;
    const yesterday = targetDate || getYesterday();
    const todayStart = `${yesterday}T00:00:00`;
    const todayEnd = `${yesterday}T23:59:59`;

    // Fetch all 3 sources in parallel
    const [links, reels, webby] = await Promise.all([
      fetchRelevantLinks(SUPABASE_URL, SUPABASE_KEY, todayStart, todayEnd),
      fetchReels(SUPABASE_URL, SUPABASE_KEY, todayStart, todayEnd),
      fetchRelevantWebby(SUPABASE_URL, SUPABASE_KEY, todayStart, todayEnd)
    ]);

    // Group by country
    const byCountry = groupByCountry(links, reels, webby);

    // Generate AI summary per country
    const countries = {};
    const countryNames = Object.keys(byCountry).sort();

    for (const country of countryNames) {
      const countryData = byCountry[country];
      const aiSummary = await generateAISummary(OPENAI_API_KEY, country, countryData, yesterday);
      countries[country] = {
        links_count: countryData.links.length,
        reels_count: countryData.reels.length,
        webby_count: countryData.webby.length,
        top_links: countryData.links.slice(0, 5).map(l => ({ title: l.title, domain: l.domain, relevance: l.relevance, write_idea: l.write_idea })),
        top_reels: countryData.reels.slice(0, 5).map(r => ({ theme: r.theme, category: r.category, account: r.account_url, views: r.views, hook: r.hook })),
        top_webby: countryData.webby.slice(0, 5).map(w => ({ topic: w.topic, keyword: w.keyword })),
        ai_summary: aiSummary
      };
    }

    // Generate overall summary
    const overallSummary = await generateOverallSummary(OPENAI_API_KEY, countries, yesterday);

    const digestContent = {
      date: yesterday,
      generated_at: new Date().toISOString(),
      total_links: links.length,
      total_reels: reels.length,
      total_webby: webby.length,
      countries,
      overall_summary: overallSummary
    };

    // Upsert into daily_digest
    const upsertResp = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_digest?on_conflict=digest_date`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          digest_date: yesterday,
          content: digestContent
        })
      }
    );

    return res.status(200).json({ success: true, digest_date: yesterday, content: digestContent });
  } catch (error) {
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}

// --- Data fetching ---

async function fetchRelevantLinks(url, key, from, to) {
  const resp = await fetch(
    `${url}/rest/v1/incoming_links?select=title,domain,relevance,write_idea,region,country,uploaded_at&uploaded_at=gte.${from}&uploaded_at=lte.${to}&or=(relevance.ilike.*high*,relevance.ilike.*medium*)&limit=500`,
    { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
  );
  return resp.ok ? await resp.json() : [];
}

async function fetchReels(url, key, from, to) {
  const resp = await fetch(
    `${url}/rest/v1/instagram_reels?select=theme,category,hook,content,account_url,views,likes,country,added_date&added_date=gte.${from}&added_date=lte.${to}&order=views.desc.nullslast&limit=500`,
    { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
  );
  return resp.ok ? await resp.json() : [];
}

async function fetchRelevantWebby(url, key, from, to) {
  const resp = await fetch(
    `${url}/rest/v1/memory?select=topic,keyword,country,relevance,created_at&created_at=gte.${from}&created_at=lte.${to}&relevance=eq.relevant&limit=500`,
    { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
  );
  return resp.ok ? await resp.json() : [];
}

// --- Grouping ---

function normalizeCountry(item) {
  const c = item.country || item.region || null;
  if (!c) return 'Unknown';
  const clean = c.replace(/🇦🇪|🇴🇲|🇸🇦|🇧🇭|🇶🇦|🇰🇼|❌|✅/g, '').trim();
  if (/uae|dubai|abu dhabi|sharjah|ajman|fujairah|ras al|umm al/i.test(clean)) return 'UAE';
  if (/oman|muscat/i.test(clean)) return 'Oman';
  if (/ksa|saudi|riyadh|jeddah/i.test(clean)) return 'KSA';
  if (/bahrain/i.test(clean)) return 'Bahrain';
  if (/qatar|doha/i.test(clean)) return 'Qatar';
  if (/kuwait/i.test(clean)) return 'Kuwait';
  return clean || 'Unknown';
}

function groupByCountry(links, reels, webby) {
  const result = {};

  const ensure = (c) => {
    if (!result[c]) result[c] = { links: [], reels: [], webby: [] };
  };

  for (const l of links) {
    const c = normalizeCountry(l);
    ensure(c);
    result[c].links.push(l);
  }
  for (const r of reels) {
    const c = normalizeCountry(r);
    ensure(c);
    result[c].reels.push(r);
  }
  for (const w of webby) {
    const c = normalizeCountry(w);
    ensure(c);
    result[c].webby.push(w);
  }

  return result;
}

// --- AI generation ---

async function generateAISummary(apiKey, country, data, date) {
  const linkTopics = data.links.map(l => `- [${l.domain}] ${l.title}: ${l.write_idea || ''}`).join('\n');
  const reelTopics = data.reels.map(r => `- [${r.account_url}] ${r.theme} (${r.category || 'n/a'}, ${r.views || 0} views): ${r.hook || ''}`).join('\n');
  const webbyTopics = data.webby.map(w => `- ${w.topic} (keyword: ${w.keyword || 'n/a'})`).join('\n');

  const prompt = `Analyze yesterday's (${date}) content data for ${country}. Provide a concise summary of top trending topics and content opportunities.

INCOMING LINKS (${data.links.length} relevant articles):
${linkTopics || 'None'}

INSTAGRAM REELS (${data.reels.length} reels):
${reelTopics || 'None'}

WEBBY/SOCIAL DATA (${data.webby.length} posts):
${webbyTopics || 'None'}

Respond in this JSON format:
{
  "top_themes": ["theme1", "theme2", "theme3"],
  "content_opportunities": "2-3 sentence summary of best content opportunities",
  "trending_note": "1 sentence on what's trending in ${country}"
}`;

  try {
    return await callOpenAI(apiKey, prompt);
  } catch (e) {
    return { error: e.message };
  }
}

async function generateOverallSummary(apiKey, countries, date) {
  const countryList = Object.entries(countries).map(([name, data]) => {
    const themes = data.ai_summary?.top_themes?.join(', ') || 'n/a';
    return `${name}: ${data.links_count} links, ${data.reels_count} reels, ${data.webby_count} webby posts. Themes: ${themes}`;
  }).join('\n');

  const prompt = `Based on yesterday's (${date}) content data across all GCC countries, provide a brief executive summary:

${countryList}

Respond in JSON:
{
  "headline": "One catchy headline for the day",
  "summary": "3-4 sentence executive summary of the day's content landscape across the region",
  "top_opportunity": "The single best content opportunity to act on today"
}`;

  try {
    return await callOpenAI(apiKey, prompt);
  } catch (e) {
    return { error: e.message };
  }
}

async function callOpenAI(apiKey, prompt) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a content analyst. Always respond with valid JSON.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    return { error: `OpenAI API error: ${resp.status}`, detail: err };
  }

  const result = await resp.json();
  const text = result.choices?.[0]?.message?.content || '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  return { raw: text };
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
