"""
NH 나무 OpenAPI - 국내주식 잔고 자동 조회
참고: https://openapi.nhqv.com (로그인 후 API 문서 확인)
"""
import requests, json, os, sys
from datetime import datetime, timezone, timedelta
import yfinance as yf

KST        = timezone(timedelta(hours=9))
APP_KEY    = os.environ["NH_APP_KEY"]
APP_SECRET = os.environ["NH_APP_SECRET"]
CANO       = os.environ["NH_CANO"]       # 계좌번호 (숫자만, 예: 12345678)
BASE_URL   = "https://openapi.nhqv.com"


# ── 1. Access Token 발급 ─────────────────────────────────────────────────────

def get_access_token():
    res = requests.post(
        f"{BASE_URL}/oauth2/token",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type":   "client_credentials",
            "appkey":        APP_KEY,
            "appsecretkey":  APP_SECRET,
            "scope":         "oob",
        },
        timeout=10,
    )
    res.raise_for_status()
    return res.json()["access_token"]


# ── 2. 국내주식 잔고 조회 (TR: CSPAQ12300) ───────────────────────────────────

def get_kr_balance(token):
    res = requests.post(
        f"{BASE_URL}/v1/stock/balance",
        headers={
            "Authorization": f"Bearer {token}",
            "appkey":        APP_KEY,
            "appsecret":     APP_SECRET,
            "tr_cd":         "CSPAQ12300",
            "Content-Type":  "application/json",
        },
        json={
            "CANO":         CANO,
            "ACNT_PRDT_CD": "01",
            "INQR_DVSN_1":  "",
            "BSPR_BF_DT_APLY_YN": "N",
        },
        timeout=10,
    )
    res.raise_for_status()
    return res.json()


def parse_kr_balance(data):
    """
    NH API 응답에서 종목별 보유 현황 파싱.
    응답 구조가 다를 경우 https://openapi.nhqv.com 에서 CSPAQ12300 응답 스펙 확인.
    """
    holdings, total = [], 0
    output = data.get("output1") or data.get("Output1") or []
    for item in output:
        # 필드명은 NH 문서 기준 (변경 시 아래 key 수정)
        shares = int(item.get("RMND_QTY",  item.get("hldg_qty", 0)) or 0)
        if shares == 0:
            continue
        price  = int(item.get("NOW_PRIC2", item.get("prpr", 0)) or 0)
        avg    = int(item.get("PCHS_AVG_PRIC", item.get("pchs_avg_pric", price)) or price)
        change_pct = round((price - avg) / avg * 100, 2) if avg else 0
        value  = shares * price
        holdings.append({
            "ticker":          item.get("PDNO", item.get("pdno", "")),
            "name":            item.get("PRDT_NAME", item.get("prdt_name", "")),
            "shares":          shares,
            "current_price":   price,
            "avg_price":       avg,
            "value_krw":       value,
            "daily_change_pct": change_pct,
        })
        total += value
    return holdings, total


# ── 3. 해외주식은 yfinance (portfolio.json 기준) ──────────────────────────────

def get_us_stocks():
    with open("portfolio.json") as f:
        portfolio = json.load(f)

    try:
        fx = requests.get("https://api.exchangerate-api.com/v4/latest/USD", timeout=10)
        usd_krw = fx.json()["rates"].get("KRW", 1380)
    except Exception:
        usd_krw = 1380

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
            print(f"  yfinance error for {item['ticker']}: {e}", file=sys.stderr)
            price_usd, change_pct = 0, 0
        value_krw = round(price_usd * item["shares"] * usd_krw)
        holdings.append({
            "ticker":            item["ticker"],
            "name":              item["name"],
            "shares":            item["shares"],
            "current_price_usd": price_usd,
            "value_krw":         value_krw,
            "daily_change_pct":  change_pct,
        })
        total += value_krw
    return holdings, total, usd_krw


# ── 4. 메인 ──────────────────────────────────────────────────────────────────

def main():
    now = datetime.now(KST).isoformat()

    # 국내주식 (NH API)
    try:
        token        = get_access_token()
        kr_raw       = get_kr_balance(token)
        kr_holdings, kr_total = parse_kr_balance(kr_raw)
        print(f"NH KR stocks: ₩{kr_total:,} ({len(kr_holdings)}개 종목)")
    except Exception as e:
        print(f"NH API error: {e}", file=sys.stderr)
        # 에러 시 기존 파일 보존
        try:
            with open("data/stocks_kr.json") as f:
                existing = json.load(f)
            kr_holdings = existing.get("holdings", [])
            kr_total    = existing.get("total_value_krw", 0)
        except Exception:
            kr_holdings, kr_total = [], 0

    # 해외주식 (yfinance)
    try:
        us_holdings, us_total, usd_krw = get_us_stocks()
        print(f"US stocks: ₩{us_total:,} (USD/KRW {usd_krw})")
    except Exception as e:
        print(f"yfinance error: {e}", file=sys.stderr)
        us_holdings, us_total, usd_krw = [], 0, 1380

    # 저장
    with open("data/stocks_kr.json", "w", encoding="utf-8") as f:
        json.dump({"updated_at": now, "holdings": kr_holdings, "total_value_krw": kr_total}, f, ensure_ascii=False, indent=2)

    with open("data/stocks_us.json", "w", encoding="utf-8") as f:
        json.dump({"updated_at": now, "usd_krw": usd_krw, "holdings": us_holdings, "total_value_krw": us_total}, f, ensure_ascii=False, indent=2)

    with open("data/last_updated.json", "w") as f:
        json.dump({"at": now}, f)


if __name__ == "__main__":
    main()
