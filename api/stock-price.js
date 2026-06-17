export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const tickers = (req.query.tickers || '').trim();
  if (!tickers) return res.json({});

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(tickers)}&fields=regularMarketPrice,regularMarketPreviousClose,currency,shortName&lang=ko-KR&region=KR`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Yahoo Finance 응답 오류: ${response.status}` });
    }

    const data = await response.json();
    const result = {};

    for (const quote of data?.quoteResponse?.result ?? []) {
      result[quote.symbol] = {
        price: quote.regularMarketPrice ?? 0,
        previousClose: quote.regularMarketPreviousClose ?? 0,
        currency: quote.currency ?? 'KRW',
        name: quote.shortName ?? quote.symbol,
        changePct: quote.regularMarketPreviousClose
          ? Math.round(((quote.regularMarketPrice - quote.regularMarketPreviousClose) / quote.regularMarketPreviousClose) * 10000) / 100
          : 0,
      };
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
