"""
네이버 부동산 비공식 API로 아파트 시세 자동 조회 (API 키 불필요)
서대문센트럴아이파크 104동 601호 기준
"""
import json, requests
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
APT_KEYWORD = "서대문 센트럴아이파크"
MY_DONG = "104"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://m.land.naver.com/",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9",
}


def find_complex():
    """단지 검색 → (hscpNo, complexName) 반환. 여러 키워드·방법 시도."""
    keywords = ["서대문센트럴아이파크", "서대문 센트럴아이파크", "센트럴아이파크"]
    for kw in keywords:
        for url in [
            "https://m.land.naver.com/complex/ajax/complexSearchList",
            "https://new.land.naver.com/api/complexes",
        ]:
            try:
                r = requests.get(
                    url, params={"cortarNo": "", "keyword": kw},
                    headers=HEADERS, timeout=15,
                )
                print(f"  검색 '{kw}' [{url.split('/')[2]}]: HTTP {r.status_code}")
                if r.status_code != 200:
                    print(f"  응답: {r.text[:300]}")
                    continue
                try:
                    data = r.json()
                except ValueError:
                    print(f"  JSON 파싱 실패. 응답: {r.text[:300]}")
                    continue
                if not data:
                    print("  빈 응답")
                    continue
                items = data if isinstance(data, list) else data.get("list", data.get("result", data.get("complexes", [])))
                if items:
                    c = items[0]
                    hscp_no = c.get("hscpNo") or c.get("complexNo") or c.get("hscpSeq")
                    name = c.get("complexName") or c.get("hscpNm", "")
                    if hscp_no:
                        print(f"  단지 발견: {name} (hscpNo={hscp_no})")
                        return str(hscp_no), name
                print(f"  단지 없음. raw: {str(data)[:200]}")
            except Exception as e:
                print(f"  요청 실패: {e}")
    return None, None


def get_recent_trades(hscp_no):
    """실거래가 목록 조회"""
    r = requests.get(
        "https://m.land.naver.com/complex/ajax/realPriceList",
        params={"hscpNo": hscp_no, "tradeType": "A1", "year": 3, "rletTypeCd": "APT", "areaNo": ""},
        headers=HEADERS, timeout=15,
    )
    data = r.json()
    return data.get("list", data if isinstance(data, list) else [])


def get_complex_price(hscp_no):
    """단지 시세 조회"""
    r = requests.get(
        "https://m.land.naver.com/complex/ajax/complexInfo",
        params={"hscpNo": hscp_no},
        headers=HEADERS, timeout=15,
    )
    return r.json()


def parse_price(s):
    """'7억 5,000' 형태 → 원 단위 정수"""
    if not s:
        return 0
    s = str(s).replace(" ", "").replace(",", "")
    total = 0
    if "억" in s:
        parts = s.split("억")
        total += int(parts[0]) * 100_000_000
        s = parts[1]
    if s and s.isdigit():
        total += int(s) * 10_000
    elif s:
        try:
            total += int(s) * 10_000
        except ValueError:
            pass
    return total


def main():
    now = datetime.now(KST).isoformat()
    empty = {
        "updatedAt": now,
        "aptName": "서대문센트럴아이파크",
        "estimatedValue": 0,
        "recentTrade": None,
        "allTrades": [],
        "note": "시세 조회 실패",
    }

    try:
        hscp_no, complex_name = find_complex()
        print(f"  단지 검색: {complex_name} (hscpNo={hscp_no})")
        if not hscp_no:
            raise ValueError("단지를 찾을 수 없음")
    except Exception as e:
        print(f"  단지 검색 실패: {e}")
        with open("data/my_home.json", "w", encoding="utf-8") as f:
            json.dump(empty, f, ensure_ascii=False, indent=2)
        return

    # 실거래가 조회
    trades = []
    try:
        raw = get_recent_trades(hscp_no)
        for t in raw:
            price_raw = t.get("dealAmt") or t.get("price") or t.get("tradePrice", 0)
            price = parse_price(price_raw) if isinstance(price_raw, str) else int(price_raw or 0) * 10_000
            dong = str(t.get("buildingName") or t.get("dong", ""))
            floor = str(t.get("floor", ""))
            area = str(t.get("area") or t.get("exclusiveArea", ""))
            date = str(t.get("tradeDate") or t.get("dealDate") or t.get("date", ""))
            if price > 0:
                trades.append({"dong": dong, "floor": floor, "area": area, "amount": price, "date": date})
        trades.sort(key=lambda x: x["date"], reverse=True)
        print(f"  실거래 {len(trades)}건 조회")
    except Exception as e:
        print(f"  실거래 조회 실패: {e}")

    # 104동 우선, 없으면 전체 최신
    same_dong = [t for t in trades if t["dong"] == MY_DONG]
    candidates = same_dong if same_dong else trades

    if candidates:
        latest = candidates[0]
        note = f"{'104동' if same_dong else '단지 내'} 최근 실거래가 기준 ({latest['date']}, {latest['floor']}층, {latest['area']}㎡)"
        estimated = latest["amount"]
    else:
        # 실거래 없으면 단지 시세로 폴백
        try:
            info = get_complex_price(hscp_no)
            price_info = info.get("priceInfo") or info.get("siseInfo") or {}
            price_raw = price_info.get("dealAmt") or price_info.get("price", 0)
            estimated = parse_price(price_raw) if isinstance(price_raw, str) else int(price_raw or 0) * 10_000
            note = f"단지 평균 시세 기준 ({complex_name})"
        except Exception:
            estimated = 0
            note = "시세 데이터 없음"

    print(f"  추정 시세: ₩{estimated:,}  ({note})")

    with open("data/my_home.json", "w", encoding="utf-8") as f:
        json.dump({
            "updatedAt": now,
            "aptName": complex_name or "서대문센트럴아이파크",
            "hscpNo": hscp_no,
            "estimatedValue": estimated,
            "recentTrade": candidates[0] if candidates else None,
            "allTrades": candidates[:5],
            "note": note,
        }, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
