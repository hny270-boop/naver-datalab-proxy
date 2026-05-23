export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const CLIENT_ID = process.env.NAVER_CLIENT_ID;
  const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
  if (!CLIENT_ID || !CLIENT_SECRET)
    return res.status(500).json({ ok: false, error: '환경변수 미설정' });

  const { keywords, startDate, endDate, timeUnit = 'month' } = req.body;
  const end = endDate || new Date().toISOString().slice(0, 10);
  const start = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const body = {
    startDate: start, endDate: end, timeUnit,
    keywordGroups: keywords.map(kw => ({ groupName: kw, keywords: [kw] }))
  };
  const naverRes = await fetch('https://openapi.naver.com/v1/datalab/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Naver-Client-Id': CLIENT_ID,
      'X-Naver-Client-Secret': CLIENT_SECRET
    },
    body: JSON.stringify(body)
  });
  const data = await naverRes.json();

  const results = data.results.map(r => {
    const ratios = r.data.map(d => d.ratio);
    const latest = ratios.slice(-3);
    const prev = ratios.slice(-6, -3);
    const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
    const latestA = avg(latest);
    const prevA = avg(prev);
    const trend = prevA > 0 ? (latestA - prevA) / prevA * 100 : 0;
    return {
      keyword: r.title,
      data: r.data,
      latestAvg: Math.round(latestA * 10) / 10,
      trend: Math.round(trend * 10) / 10,
      trendLabel: trend > 10 ? '상승' : trend < -10 ? '하락' : '보합',
      score: Math.min(100, Math.round(latestA)),
      peak: Math.max(...ratios)
    };
  });
  return res.status(200).json({ ok: true, results });
}
