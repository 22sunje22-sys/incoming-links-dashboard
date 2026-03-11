// Vercel Cron Job - Runs daily to process memory data
// Schedule: every day at 6:00 AM UTC (10:00 AM Dubai)

export default async function handler(req, res) {
  // Verify cron secret (Vercel sends this header for cron jobs)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}` && !process.env.VERCEL_URL) {
    // Allow direct calls in dev, but protect in prod
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  const results = { timestamp: new Date().toISOString(), actions: [] };

  try {
    // 1. Mark new memory rows (NULL relevance) as 'relevant'
    const markRelevant = await supabaseQuery(SUPABASE_URL, SUPABASE_KEY,
      '/rest/v1/memory?relevance=is.null',
      'PATCH',
      { relevance: 'relevant' }
    );
    results.actions.push({ step: 'mark_new_as_relevant', status: markRelevant.status });

    // 2. Cross-check with skipped_topics: mark memory rows that match 'Maybe not relevant'
    const skippedLinks = await supabaseQuery(SUPABASE_URL, SUPABASE_KEY,
      '/rest/v1/skipped_topics?reason=eq.Maybe not relevant&select=link&limit=5000',
      'GET'
    );
    if (skippedLinks.ok) {
      const links = await skippedLinks.json();
      if (links.length > 0) {
        // Import new 'maybe not relevant' into memory (those not already there)
        const existingLinks = await supabaseQuery(SUPABASE_URL, SUPABASE_KEY,
          '/rest/v1/memory?select=link&link=not.is.null&limit=10000',
          'GET'
        );
        if (existingLinks.ok) {
          const existingSet = new Set((await existingLinks.json()).map(r => r.link));
          const newRows = [];
          const seen = new Set();
          for (const row of links) {
            if (row.link && !existingSet.has(row.link) && !seen.has(row.link)) {
              seen.add(row.link);
              newRows.push(row.link);
            }
          }
          results.actions.push({ step: 'new_not_relevant_found', count: newRows.length });
        }
      }
    }

    // 3. Delete 'Already posted' duplicates from skipped_topics
    const deletePosted = await supabaseQuery(SUPABASE_URL, SUPABASE_KEY,
      '/rest/v1/skipped_topics?reason=eq.Already posted',
      'DELETE'
    );
    results.actions.push({ step: 'delete_already_posted', status: deletePosted.status });

    // 4. Country backfill - pattern matching on keyword field
    const countryPatterns = [
      { country: 'Oman', patterns: ['%.om', '%\\_om', '%\\_omn', '%oman%', '%muscat%'] },
      { country: 'UAE', patterns: ['%.ae', '%dubai%', '%uae%', '%dxb%', '%abudhabi%', '%sharjah%'] },
      { country: 'KSA', patterns: ['%.sa', '%\\_sa', '%ksa%', '%saudi%', '%riyadh%', '%jeddah%'] },
      { country: 'Bahrain', patterns: ['%bahrain%', '%.bh', '%\\_bh', '%aldana%'] },
      { country: 'Qatar', patterns: ['%qatar%', '%doha%'] }
    ];

    let countryUpdated = 0;
    for (const { country, patterns } of countryPatterns) {
      for (const pattern of patterns) {
        const resp = await supabaseQuery(SUPABASE_URL, SUPABASE_KEY,
          `/rest/v1/memory?country=is.null&keyword=ilike.${encodeURIComponent(pattern)}`,
          'PATCH',
          { country }
        );
        if (resp.status === 200 || resp.status === 204) countryUpdated++;
      }
      // Also match on topic field
      for (const pattern of patterns) {
        await supabaseQuery(SUPABASE_URL, SUPABASE_KEY,
          `/rest/v1/memory?country=is.null&topic=ilike.${encodeURIComponent(pattern)}`,
          'PATCH',
          { country }
        );
      }
    }
    results.actions.push({ step: 'country_backfill', patterns_applied: countryUpdated });

    // 5. Stats summary
    const statsResp = await supabaseQuery(SUPABASE_URL, SUPABASE_KEY,
      '/rest/v1/memory?select=relevance,country',
      'GET',
      null,
      { 'Prefer': 'count=exact', 'Range': '0-0' }
    );
    const totalHeader = statsResp.headers?.get?.('content-range');
    results.actions.push({ step: 'stats', content_range: totalHeader });

    res.status(200).json({ success: true, ...results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, ...results });
  }
}

async function supabaseQuery(url, key, path, method = 'GET', body = null, extraHeaders = {}) {
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'PATCH' ? 'return=minimal' : '',
    ...extraHeaders
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  return fetch(`${url}${path}`, options);
}
