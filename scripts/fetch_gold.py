"""
금 시세 자동 조회 (yfinance GC=F 금 선물)
보유량: 110돈 (1돈 = 3.75g, 1 troy oz = 31.1035g)
"""
import json, requests, sys
from datetime import datetime, timezone, timedelta
import yfinance as yf

KST = timezone(timedelta(hours=9))
GOLD_DONS = 110
GRAMS_PER_DON = 3.75
GRAMS_PER_OZ = 31.1035


def fetch_usd_krw():
    try:
        r = requests.get("https://api.exchangerate-api.com/v4/latest/USD", timeout=10)
        return r.json()["rates"].get("KRW", 1380)
    except Exception:
        return 1380


def main():
    now = datetime.now(KST).isoformat()

    try:
        info = yf.Ticker("GC=F").fast_info
        price_usd_per_oz = round(float(info.last_price), 2)
    except Exception as e:
        print(f"  금 시세 조회 실패: {e}", file=sys.stderr)
        price_usd_per_oz = 0

    usd_krw = fetch_usd_krw()
    total_grams = GOLD_DONS * GRAMS_PER_DON                            # 412.5g
    price_krw_per_gram = round(price_usd_per_oz / GRAMS_PER_OZ * usd_krw)
    price_krw_per_don  = round(price_krw_per_gram * GRAMS_PER_DON)
    total_value_krw    = round(price_usd_per_oz * (total_grams / GRAMS_PER_OZ) * usd_krw)

    print(f"  금 시세: ${price_usd_per_oz}/oz  USD/KRW: {usd_krw}")
    print(f"  ₩{price_krw_per_gram:,}/g  ₩{price_krw_per_don:,}/돈")
    print(f"  보유 {GOLD_DONS}돈({total_grams}g) → ₩{total_value_krw:,}")

    with open("data/gold.json", "w", encoding="utf-8") as f:
        json.dump({
            "updatedAt": now,
            "dons": GOLD_DONS,
            "grams": total_grams,
            "priceUsdPerOz": price_usd_per_oz,
            "usdKrw": usd_krw,
            "priceKrwPerGram": price_krw_per_gram,
            "priceKrwPerDon": price_krw_per_don,
            "totalValueKrw": total_value_krw,
        }, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
