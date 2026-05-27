// api/competition.js
// 네이버 쇼핑 API로 키워드 경쟁 포화도 측정
// 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (데이터랩과 동일)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const CLIENT_ID     = process.env.NAVER_CLIENT_ID;
  const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ ok: false, error: '환경변수 미설정' });
  }

  const { keyword, display = 10 } = req.body;
  if (!keyword) return res.status(400).json({ ok: false, error: 'keyword 필요' });

  try {
    // 네이버 쇼핑 검색 API
    const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=${display}&sort=sim`;
    const naverRes = await fetch(url, {
      headers: {
        'X-Naver-Client-Id':     CLIENT_ID,
        'X-Naver-Client-Secret': CLIENT_SECRET
      }
    });

    if (!naverRes.ok) {
      const errText = await naverRes.text();
      return res.status(naverRes.status).json({ ok: false, error: errText });
    }

    const data = await naverRes.json();
    const total = data.total || 0;
    const items = data.items || [];

    // 가격 분석
    const prices = items
      .map(i => parseInt(i.lprice || 0))
      .filter(p => p > 0);

    const avgPrice = prices.length
      ? Math.round(prices.reduce((a,b)=>a+b,0) / prices.length)
      : 0;
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;

    // 경쟁 포화도 점수 계산 (0~100, 높을수록 경쟁 치열)
    let competitionScore;
    if (total >= 500000)      competitionScore = 95;
    else if (total >= 200000) competitionScore = 85;
    else if (total >= 100000) competitionScore = 75;
    else if (total >= 50000)  competitionScore = 65;
    else if (total >= 20000)  competitionScore = 50;
    else if (total >= 5000)   competitionScore = 35;
    else if (total >= 1000)   competitionScore = 20;
    else                      competitionScore = 10;

    // 포화도 레이블
    const label =
      competitionScore >= 80 ? '매우 높음' :
      competitionScore >= 60 ? '높음' :
      competitionScore >= 40 ? '중간' :
      competitionScore >= 20 ? '낮음' : '매우 낮음';

    // 추천 여부
    const recommend =
      competitionScore <= 35 ? '✅ 진입 추천 — 경쟁이 적어 틈새 공략 가능' :
      competitionScore <= 65 ? '⚠ 신중 검토 — 차별화 포인트 필요' :
                               '❌ 진입 어려움 — 경쟁 과포화 상태';

    // 상위 판매자 브랜드 추출
    const brands = [...new Set(items.map(i => i.brand).filter(Boolean))].slice(0, 5);
    const malls  = [...new Set(items.map(i => i.mallName).filter(Boolean))].slice(0, 5);

    return res.status(200).json({
      ok: true,
      keyword,
      total,           // 전체 상품 수
      competitionScore,// 경쟁 포화도 점수 (0~100)
      label,           // 경쟁 수준 레이블
      recommend,       // 진입 추천 여부
      pricing: {
        min: minPrice,
        max: maxPrice,
        avg: avgPrice
      },
      topBrands: brands,
      topMalls:  malls,
      sampleItems: items.slice(0, 3).map(i => ({
        title:    i.title.replace(/<[^>]+>/g, ''),
        price:    parseInt(i.lprice || 0),
        mall:     i.mallName,
        brand:    i.brand || '',
        category: i.category1 || ''
      }))
    });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
