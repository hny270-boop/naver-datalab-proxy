// api/aliexpress.js
// 알리익스프레스 상품 검색 및 가격 조회
// AliExpress Affiliate API 사용 (무료)
// 환경변수: ALI_APP_KEY, ALI_APP_SECRET

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const APP_KEY    = process.env.ALI_APP_KEY;
  const APP_SECRET = process.env.ALI_APP_SECRET;

  // API 키 없으면 더미 데이터 반환 (테스트용)
  if (!APP_KEY || !APP_SECRET) {
    const { keyword } = req.body;
    return res.status(200).json({
      ok: true,
      source: 'mock',
      keyword,
      products: generateMockPrices(keyword)
    });
  }

  const { keyword, currency = 'KRW', pageSize = 5 } = req.body;
  if (!keyword) return res.status(400).json({ ok: false, error: 'keyword 필요' });

  try {
    // AliExpress Affiliate API 호출
    const params = new URLSearchParams({
      app_key:      APP_KEY,
      method:       'aliexpress.affiliate.product.query',
      sign_method:  'md5',
      timestamp:    new Date().toISOString().replace('T',' ').slice(0,19),
      format:       'json',
      v:            '2.0',
      keywords:     keyword,
      page_no:      '1',
      page_size:    String(pageSize),
      fields:       'product_id,product_title,sale_price,original_price,evaluate_rate,product_main_image_url,product_detail_url',
      target_currency: currency,
      target_language: 'KO',
      tracking_id:  'sourcing_radar'
    });

    // 서명 생성
    const sign = generateSign(params, APP_SECRET);
    params.set('sign', sign);

    const apiRes = await fetch(`https://api-sg.aliexpress.com/sync?${params.toString()}`);
    const data = await apiRes.json();

    const items = data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product || [];

    const products = items.map(p => ({
      id:           p.product_id,
      title:        p.product_title?.slice(0, 60) || '',
      salePrice:    parseFloat(p.sale_price || 0),
      originalPrice:parseFloat(p.original_price || 0),
      currency,
      rating:       parseFloat(p.evaluate_rate || 0),
      imageUrl:     p.product_main_image_url || '',
      detailUrl:    p.product_detail_url || '',
    }));

    // 가격 통계
    const prices = products.map(p => p.salePrice).filter(p => p > 0);
    const stats = prices.length ? {
      min:    Math.min(...prices),
      max:    Math.max(...prices),
      avg:    Math.round(prices.reduce((a,b)=>a+b,0)/prices.length * 100) / 100,
      median: prices.sort((a,b)=>a-b)[Math.floor(prices.length/2)]
    } : null;

    return res.status(200).json({ ok: true, source: 'api', keyword, products, stats });

  } catch (err) {
    // API 실패 시 목업 반환
    return res.status(200).json({
      ok: true,
      source: 'mock_fallback',
      keyword,
      products: generateMockPrices(keyword),
      error: err.message
    });
  }
}

// MD5 서명 생성
function generateSign(params, secret) {
  const sorted = [...params.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const str = secret + sorted.map(([k,v])=>k+v).join('') + secret;
  return md5(str).toUpperCase();
}

// 간단한 MD5 구현
function md5(str) {
  function safeAdd(x, y) { const lsw=(x&0xFFFF)+(y&0xFFFF); return (((x>>16)+(y>>16)+(lsw>>16))<<16)|(lsw&0xFFFF); }
  function bitRotateLeft(num, cnt) { return (num<<cnt)|(num>>>(32-cnt)); }
  function md5cmn(q,a,b,x,s,t){return safeAdd(bitRotateLeft(safeAdd(safeAdd(a,q),safeAdd(x,t)),s),b);}
  function md5ff(a,b,c,d,x,s,t){return md5cmn((b&c)|((~b)&d),a,b,x,s,t);}
  function md5gg(a,b,c,d,x,s,t){return md5cmn((b&d)|(c&(~d)),a,b,x,s,t);}
  function md5hh(a,b,c,d,x,s,t){return md5cmn(b^c^d,a,b,x,s,t);}
  function md5ii(a,b,c,d,x,s,t){return md5cmn(c^(b|(~d)),a,b,x,s,t);}
  const bytes = new TextEncoder().encode(str);
  const len8 = bytes.length;
  const len32 = Math.ceil((len8+9)/64)*16;
  const M = new Int32Array(len32);
  for(let i=0;i<len8;i++) M[i>>2]|=bytes[i]<<((i%4)*8);
  M[len8>>2]|=0x80<<((len8%4)*8);
  M[len32-2]=len8*8;
  let a=1732584193,b=-271733879,c=-1732584194,d=271733878;
  for(let i=0;i<len32;i+=16){
    const [A,B,C,D]=[a,b,c,d];
    a=md5ff(a,b,c,d,M[i],7,-680876936);d=md5ff(d,a,b,c,M[i+1],12,-389564586);c=md5ff(c,d,a,b,M[i+2],17,606105819);b=md5ff(b,c,d,a,M[i+3],22,-1044525330);
    a=md5ff(a,b,c,d,M[i+4],7,-176418897);d=md5ff(d,a,b,c,M[i+5],12,1200080426);c=md5ff(c,d,a,b,M[i+6],17,-1473231341);b=md5ff(b,c,d,a,M[i+7],22,-45705983);
    a=md5ff(a,b,c,d,M[i+8],7,1770035416);d=md5ff(d,a,b,c,M[i+9],12,-1958414417);c=md5ff(c,d,a,b,M[i+10],17,-42063);b=md5ff(b,c,d,a,M[i+11],22,-1990404162);
    a=md5ff(a,b,c,d,M[i+12],7,1804603682);d=md5ff(d,a,b,c,M[i+13],12,-40341101);c=md5ff(c,d,a,b,M[i+14],17,-1502002290);b=md5ff(b,c,d,a,M[i+15],22,1236535329);
    a=md5gg(a,b,c,d,M[i+1],5,-165796510);d=md5gg(d,a,b,c,M[i+6],9,-1069501632);c=md5gg(c,d,a,b,M[i+11],14,643717713);b=md5gg(b,c,d,a,M[i],20,-373897302);
    a=md5gg(a,b,c,d,M[i+5],5,-701558691);d=md5gg(d,a,b,c,M[i+10],9,38016083);c=md5gg(c,d,a,b,M[i+15],14,-660478335);b=md5gg(b,c,d,a,M[i+4],20,-405537848);
    a=md5gg(a,b,c,d,M[i+9],5,568446438);d=md5gg(d,a,b,c,M[i+14],9,-1019803690);c=md5gg(c,d,a,b,M[i+3],14,-187363961);b=md5gg(b,c,d,a,M[i+8],20,1163531501);
    a=md5gg(a,b,c,d,M[i+13],5,-1444681467);d=md5gg(d,a,b,c,M[i+2],9,-51403784);c=md5gg(c,d,a,b,M[i+7],14,1735328473);b=md5gg(b,c,d,a,M[i+12],20,-1926607734);
    a=md5hh(a,b,c,d,M[i+5],4,-378558);d=md5hh(d,a,b,c,M[i+8],11,-2022574463);c=md5hh(c,d,a,b,M[i+11],16,1839030562);b=md5hh(b,c,d,a,M[i+14],23,-35309556);
    a=md5hh(a,b,c,d,M[i+1],4,-1530992060);d=md5hh(d,a,b,c,M[i+4],11,1272893353);c=md5hh(c,d,a,b,M[i+7],16,-155497632);b=md5hh(b,c,d,a,M[i+10],23,-1094730640);
    a=md5hh(a,b,c,d,M[i+13],4,681279174);d=md5hh(d,a,b,c,M[i],11,-358537222);c=md5hh(c,d,a,b,M[i+3],16,-722521979);b=md5hh(b,c,d,a,M[i+6],23,76029189);
    a=md5hh(a,b,c,d,M[i+9],4,-640364487);d=md5hh(d,a,b,c,M[i+12],11,-421815835);c=md5hh(c,d,a,b,M[i+15],16,530742520);b=md5hh(b,c,d,a,M[i+2],23,-995338651);
    a=md5ii(a,b,c,d,M[i],6,-198630844);d=md5ii(d,a,b,c,M[i+7],10,1126891415);c=md5ii(c,d,a,b,M[i+14],15,-1416354905);b=md5ii(b,c,d,a,M[i+5],21,-57434055);
    a=md5ii(a,b,c,d,M[i+12],6,1700485571);d=md5ii(d,a,b,c,M[i+3],10,-1894986606);c=md5ii(c,d,a,b,M[i+10],15,-1051523);b=md5ii(b,c,d,a,M[i+1],21,-2054922799);
    a=md5ii(a,b,c,d,M[i+8],6,1873313359);d=md5ii(d,a,b,c,M[i+15],10,-30611744);c=md5ii(c,d,a,b,M[i+6],15,-1560198380);b=md5ii(b,c,d,a,M[i+13],21,1309151649);
    a=md5ii(a,b,c,d,M[i+4],6,-145523070);d=md5ii(d,a,b,c,M[i+11],10,-1120210379);c=md5ii(c,d,a,b,M[i+2],15,718787259);b=md5ii(b,c,d,a,M[i+9],21,-343485551);
    a=safeAdd(a,A);b=safeAdd(b,B);c=safeAdd(c,C);d=safeAdd(d,D);
  }
  return [a,b,c,d].map(n=>Array.from({length:4},(_,i)=>('0'+((n>>(i*8))&0xFF).toString(16)).slice(-2)).join('')).join('');
}

// API 키 없을 때 키워드 기반 목업 가격 생성
function generateMockPrices(keyword) {
  const base = hashCode(keyword);
  const prices = [
    { multiplier: 0.8, title: '기본형' },
    { multiplier: 1.0, title: '스탠다드' },
    { multiplier: 1.3, title: '프리미엄' },
    { multiplier: 0.6, title: '저가형' },
    { multiplier: 1.6, title: '고급형' },
  ];
  const basePrice = 5 + (Math.abs(base) % 45); // 5~50위안
  return prices.map((p, i) => ({
    id:           `mock_${i}`,
    title:        `${keyword} ${p.title}`,
    salePrice:    Math.round(basePrice * p.multiplier * 10) / 10,
    originalPrice:Math.round(basePrice * p.multiplier * 1.3 * 10) / 10,
    currency:     'CNY',
    rating:       3.5 + (Math.abs(base+i) % 15) / 10,
    imageUrl:     '',
    detailUrl:    `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(keyword)}`,
    isMock:       true
  }));
}
function hashCode(str) {
  let h=0;
  for(let i=0;i<str.length;i++) h=Math.imul(31,h)+str.charCodeAt(i)|0;
  return h;
}
