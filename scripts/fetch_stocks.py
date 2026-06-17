"""
portfolio.json 기반 주가 자동 조회 (yfinance)
- 한국주식: {ticker}.KS (KOSPI) / {ticker}.KQ (KOSDAQ)
- 해외주식: 그대로 (AAPL, SPY 등)
KIS API 불필요 — portfolio.json에 종목 입력하면 자동으로 가격 가져옴
"""
import json, sys
from datetime import datetime, timezone, timedelta
import yfinance as yf
import requests

KST = timezone(timedelta(hours=9))


def fetch_usd_krw():
    try:
        res = requests.get("https://api.exchangerate-api.com/v4/latest/USD", timeout=10)
        return res.json()["rates"].get("KRW", 1380)
    except Exception:
        return 1380


def fetch_kr_stocks(portfolio):
    holdings, total = [], 0
    # 같은 티커가 여러 계좌에 나뉠 수 있으므로 티커당 1회 가격 조회
    price_cache = {}
    for item in portfolio.get("stocks_kr", []):
        if item.get("shares", 0) == 0:
            continue
        ticker = item["ticker"]
        if ticker not in price_cache:
            ticker_yf = ticker + ".KS"
            if item.get("market") == "KOSDAQ":
                ticker_yf = ticker + ".KQ"
            try:
                info = yf.Ticker(ticker_yf).fast_info
                price = round(float(info.last_price))
                prev  = round(float(info.previous_close))
                change_pct = round((price - prev) / prev * 100, 2) if prev else 0
            except Exception as e:
                print(f"  yfinance error [{ticker_yf}]: {e}", file=sys.stderr)
                price, change_pct = 0, 0
            price_cache[ticker] = (price, change_pct)
        price, change_pct = price_cache[ticker]
        value = price * item["shares"]
        holdings.append({
            "ticker":           ticker,
            "name":             item["name"],
            "shares":           item["shares"],
            "avg_price_krw":    item.get("avg_price_krw", 0),
            "current_price":    price,
            "value_krw":        value,
            "daily_change_pct": change_pct,
            "account":          item.get("account", ""),
        })
        total += value

    # 계좌별 집계
    acct_map = {}
    for h in holdings:
        acct = h.get("account", "")
        if not acct:
            continue
        if acct not in acct_map:
            acct_map[acct] = {"buy": 0, "eval": 0}
        acct_map[acct]["buy"]  += h["avg_price_krw"] * h["shares"]
        acct_map[acct]["eval"] += h["value_krw"]

    ACCT_META = {
        "ISA": "7902",
        "CMA": "3866",
    }
    accounts = {}
    for acct, vals in acct_map.items():
        pnl = vals["eval"] - vals["buy"]
        pnl_pct = round(pnl / vals["buy"] * 100, 1) if vals["buy"] else 0
        accounts[acct] = {
            "account_no_last4": ACCT_META.get(acct, ""),
            "buy_amount":  round(vals["buy"]),
            "eval_amount": round(vals["eval"]),
            "pnl":         round(pnl),
            "pnl_pct":     pnl_pct,
            "yesu":        0,
        }

    return holdings, total, accounts if accounts else None


def fetch_us_stocks(portfolio, usd_krw):
    holdings, total = [], 0
    for item in portfolio.get("stocks_us", []):
        if item.get("shares", 0) == 0:
            continue
        try:
            info = yf.Ticker(item["ticker"]).fast_info
            price_usd  = round(float(info.last_price), 2)
            prev_usd   = round(float(info.previous_close), 2)
            change_pct = round((price_usd - prev_usd) / prev_usd * 100, 2) if prev_usd else 0
        except Exception as e:
            print(f"  yfinance error [{item['ticker']}]: {e}", file=sys.stderr)
            price_usd, change_pct = 0, 0
        value_krw = round(price_usd * item["shares"] * usd_krw)
        holdings.append({
            "ticker":            item["ticker"],
            "name":              item["name"],
            "shares":            item["shares"],
            "avg_price_krw":     item.get("avg_price_krw", 0),
            "current_price_usd": price_usd,
            "value_krw":         value_krw,
            "daily_change_pct":  change_pct,
        })
        total += value_krw
    return holdings, total


def main():
    now = datetime.now(KST).isoformat()

    with open("portfolio.json", encoding="utf-8") as f:
        portfolio = json.load(f)

    usd_krw = fetch_usd_krw()
    print(f"USD/KRW: {usd_krw}")

    kr_holdings, kr_total, kr_accounts = fetch_kr_stocks(portfolio)
    print(f"KR stocks: ₩{kr_total:,} ({len(kr_holdings)}개 종목)")

    us_holdings, us_total = fetch_us_stocks(portfolio, usd_krw)
    print(f"US stocks: ₩{us_total:,} ({len(us_holdings)}개 종목)")

    kr_data = {"updated_at": now, "holdings": kr_holdings, "total_value_krw": kr_total}
    if kr_accounts:
        kr_data["accounts"] = kr_accounts
    with open("data/stocks_kr.json", "w", encoding="utf-8") as f:
        json.dump(kr_data, f, ensure_ascii=False, indent=2)

    with open("data/stocks_us.json", "w", encoding="utf-8") as f:
        json.dump({"updated_at": now, "usd_krw": usd_krw, "holdings": us_holdings, "total_value_krw": us_total}, f, ensure_ascii=False, indent=2)

    with open("data/last_updated.json", "w") as f:
        json.dump({"at": now}, f)


if __name__ == "__main__":
    main()
