"""
관심단지 시세 자동 조회
- 실거래가: 국토교통부 공공데이터 API (MOLIT_API_KEY 환경변수 필요)
- 현재 매물: 네이버 부동산 비공식 API (로컬 실행 시만 동작, GitHub Actions는 IP 차단됨)
"""
import json, requests, time, sys, os
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))

NAVER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://new.land.naver.com/",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9",
}


# ─── 국토교통부 실거래가 API ──────────────────────────────────────────────────

def get_molit_trades(cortar_no, apt_name, target_area_m2, service_key, months_back=36):
    """국토교통부 아파트 실거래가 공공API (data.go.kr)"""
    if not cortar_no or len(cortar_no) < 5:
        print("  cortarNo 없음 -> MOLIT 조회 불가")
        return []

    lawd_cd = cortar_no[:5]
    now = datetime.now(KST)
    trades = []

    for i in range(months_back):
        dt = now - timedelta(days=30 * i)
        deal_ymd = dt.strftime("%Y%m")
        try:
            r = requests.get(
                "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",
                params={
                    "serviceKey": service_key,
                    "pageNo": 1,
                    "numOfRows": 100,
                    "LAWD_CD": lawd_cd,
                    "DEAL_YMD": deal_ymd,
                },
                headers={"Accept": "application/json"},
                timeout=10,
            )
            if r.status_code != 200:
                print(f"  MOLIT [{deal_ymd}]: HTTP {r.status_code}")
                time.sleep(0.3)
                continue

            body = r.json().get("response", {}).get("body", {})
            items = body.get("items", {})
            item_list = items.get("item", []) if items else []
            if isinstance(item_list, dict):
                item_list = [item_list]

            for it in item_list:
                name = (it.get("aptNm") or "").strip()
                # 단지명 매칭 (부분 포함)
                if apt_name not in name and name not in apt_name:
                    continue
                area = float(it.get("area") or 0)
                if target_area_m2 and abs(area - target_area_m2) > 10:
                    continue
                amt_str = str(it.get("dealAmount") or "0").replace(",", "").replace(" ", "")
                amt_won = int(amt_str) * 10_000 if amt_str.isdigit() else 0
                year  = it.get("dealYear", "")
                month = str(it.get("dealMonth", "")).zfill(2)
                day   = str(it.get("dealDay", "")).zfill(2)
                date_str = f"{year}-{month}-{day}"
                if amt_won > 0:
                    trades.append({"area": area, "amount": amt_won, "date": date_str})

            time.sleep(0.2)
        except Exception as e:
            print(f"  MOLIT [{deal_ymd}] 오류: {e}")

    trades.sort(key=lambda x: x["date"], reverse=True)
    if trades:
        print(f"  MOLIT 실거래 {len(trades)}건 수집")
    return trades


# ─── 네이버 부동산 API (로컬용 / 폴백) ───────────────────────────────────────

def find_complex_by_cortarno(name, cortar_no):
    url = "https://new.land.naver.com/api/regions/complexes"
    try:
        r = requests.get(url, params={"cortarNo": cortar_no, "realEstateType": "APT", "order": "rank"},
                         headers=NAVER_HEADERS, timeout=15)
        print(f"  cortarNo 조회 [{cortar_no}]: HTTP {r.status_code}")
        if r.status_code != 200:
            return None, None
        complexes = r.json().get("complexList", r.json().get("list", []))
        for c in complexes:
            c_name = c.get("complexName") or c.get("hscpNm", "")
            if name in c_name or c_name in name or any(kw in c_name for kw in name.split()):
                hscp_no = str(c.get("hscpNo") or c.get("complexNo") or "")
                if hscp_no:
                    print(f"  -> 단지 발견: {c_name} (hscpNo={hscp_no})")
                    return hscp_no, c_name
    except Exception as e:
        print(f"  cortarNo 조회 실패: {e}")
    return None, None


def find_complex_by_keyword(keywords):
    if isinstance(keywords, str):
        keywords = [keywords]
    for kw in keywords:
        try:
            r = requests.get(
                "https://new.land.naver.com/api/search",
                params={"searchType": "complex", "keyword": kw},
                headers=NAVER_HEADERS, timeout=15,
            )
            print(f"  키워드 검색 '{kw}': HTTP {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                items = data.get("complexList", data.get("list", []))
                apt_items = [
                    c for c in items
                    if c.get("rletTypeCd", "APT") in ("APT", "")
                    and "(오)" not in (c.get("complexName") or c.get("hscpNm", ""))
                ] or items
                if apt_items:
                    c = apt_items[0]
                    hscp_no = str(c.get("hscpNo") or c.get("complexNo") or "")
                    c_name = c.get("complexName") or c.get("hscpNm", "")
                    if hscp_no:
                        print(f"  -> 단지 발견: {c_name} (hscpNo={hscp_no})")
                        return hscp_no, c_name
        except Exception as e:
            print(f"  키워드 검색 실패: {e}")
        time.sleep(0.5)
    return None, None


def find_complex(keywords, cortar_no=""):
    name = keywords[0] if isinstance(keywords, list) else keywords
    if cortar_no:
        hscp_no, found_name = find_complex_by_cortarno(name, cortar_no)
        if hscp_no:
            return hscp_no, found_name
        time.sleep(1)
    return find_complex_by_keyword(keywords)


def get_area_no(hscp_no, target_area_m2):
    try:
        r = requests.get(
            "https://new.land.naver.com/api/complexes/" + hscp_no,
            headers=NAVER_HEADERS, timeout=15,
        )
        if r.status_code != 200:
            r = requests.get(
                "https://m.land.naver.com/complex/ajax/complexInfo",
                params={"hscpNo": hscp_no}, headers=NAVER_HEADERS, timeout=15,
            )
        info = r.json()
        area_list = (
            info.get("complexDetail", {}).get("pyeongList")
            or info.get("pyeongList") or info.get("areaList") or []
        )
        best_no, best_diff = "", float("inf")
        for area in area_list:
            m2 = float(area.get("exclusiveArea") or area.get("spc2") or area.get("area") or 0)
            diff = abs(m2 - target_area_m2)
            if diff < best_diff and diff <= 10:
                no = str(area.get("areaNo") or area.get("spcNo") or "")
                if no:
                    best_no, best_diff = no, diff
        return best_no
    except Exception as e:
        print(f"  areaNo 조회 실패: {e}")
    return ""


def get_listings(hscp_no, area_no=""):
    for url in [
        f"https://new.land.naver.com/api/articles/complex/{hscp_no}",
        "https://m.land.naver.com/complex/ajax/complexArticleList",
    ]:
        try:
            params = {"hscpNo": hscp_no, "tradeType": "A1", "areaNo": area_no, "page": 1}
            r = requests.get(url, params=params, headers=NAVER_HEADERS, timeout=15)
            print(f"  매물 조회 [{url.split('/')[2]}]: HTTP {r.status_code}")
            if r.status_code != 200:
                continue
            data = r.json()
            articles = data.get("articleList", data.get("list", data if isinstance(data, list) else []))
            listings = []
            for a in articles[:5]:
                price_raw = a.get("dealOrWarrantPrc") or a.get("dealAmt") or a.get("salePrice") or a.get("price", "0")
                price_eok = (parse_price(str(price_raw)) / 1e8) if isinstance(price_raw, str) else float(price_raw or 0) / 1e4 / 1e4
                art_no = a.get("articleNo") or ""
                if price_eok > 0:
                    listings.append({
                        "price": round(price_eok, 1),
                        "floor": str(a.get("floorInfo") or a.get("floor") or "-"),
                        "areaM2": float(a.get("exclusiveArea") or a.get("spc2") or a.get("area") or 0),
                        "direction": a.get("exposureDir") or a.get("direction") or "",
                        "desc": str(a.get("articleFeatureDesc") or a.get("title") or "")[:30],
                        "url": f"https://m.land.naver.com/article/{art_no}" if art_no else "",
                    })
            if listings:
                print(f"  매물 {len(listings)}건 수집")
                return listings
        except Exception as e:
            print(f"  매물 조회 실패: {e}")
    return []


def parse_price(s):
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


# ─── 메인 ────────────────────────────────────────────────────────────────────

def main():
    molit_key = os.environ.get("MOLIT_API_KEY", "").strip()
    use_molit = bool(molit_key)
    print(f"모드: {'MOLIT 공공API' if use_molit else '네이버 비공식API (로컬용)'}")

    try:
        with open("data/watchlist.json", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print("data/watchlist.json not found")
        sys.exit(1)

    items = data.get("items", [])
    now_kst = datetime.now(KST)
    changed = False

    for item in items:
        name = item.get("name", "-")
        keywords = item.get("searchKeywords") or [item.get("searchKeyword", name)]
        hscp_no = item.get("hscpNo", "")
        cortar_no = item.get("cortarNo", "")
        target_area = item.get("areaM2", 0)

        print(f"\n== [{name}] ==")

        # hscpNo 자동 발견 (네이버, 로컬 실행 시)
        if not hscp_no and not use_molit:
            hscp_no, found_name = find_complex(keywords, cortar_no)
            if hscp_no:
                item["hscpNo"] = hscp_no
                changed = True
                print(f"  hscpNo 등록: {hscp_no}")
            else:
                print("  단지를 찾지 못함 -> skip")
                continue
            time.sleep(1)

        # 실거래가 조회
        if use_molit:
            trades = get_molit_trades(cortar_no, name, target_area, molit_key)
        else:
            if not hscp_no:
                print("  hscpNo 없음 -> skip")
                continue
            trades = get_naver_trades(hscp_no, target_area)

        if not trades:
            print("  실거래 데이터 없음 -> skip")
            continue

        # recentTrades 저장 (최근 30건)
        recent = [{"area": t["area"], "amount": t["amount"], "date": t["date"]} for t in trades[:30]]
        if recent != item.get("recentTrades"):
            item["recentTrades"] = recent
            changed = True

        # 최신가 업데이트
        latest = trades[0]
        new_price_eok = round(latest["amount"] / 1e8, 1)
        old_price = item.get("currentPrice", 0) or 0
        print(f"  최신 실거래: {new_price_eok}억 ({latest['date']}, {latest['area']:.1f}m2)")

        if new_price_eok != old_price:
            item["prevPrice"] = old_price
            item["currentPrice"] = new_price_eok
            item["priceUpdatedAt"] = now_kst.strftime("%y.%m.%d")
            changed = True
            print(f"  가격 업데이트: {old_price}억 -> {new_price_eok}억 {'^ ' if new_price_eok > old_price else 'v '}")
        else:
            print(f"  가격 변동 없음 ({new_price_eok}억)")

        # 현재 매물 조회 (네이버, hscp_no 있을 때만)
        if hscp_no and not use_molit:
            area_no = get_area_no(hscp_no, target_area)
            time.sleep(0.5)
            listings = get_listings(hscp_no, area_no)
            if listings:
                item["listings"] = listings
                item["listingsUpdatedAt"] = now_kst.strftime("%y.%m.%d")
                changed = True
        elif hscp_no and use_molit:
            # MOLIT 모드에서도 네이버 매물 시도 (실패해도 무시)
            try:
                area_no = get_area_no(hscp_no, target_area)
                time.sleep(0.5)
                listings = get_listings(hscp_no, area_no)
                if listings:
                    item["listings"] = listings
                    item["listingsUpdatedAt"] = now_kst.strftime("%y.%m.%d")
                    changed = True
            except Exception:
                pass

        time.sleep(0.5)

    data["updatedAt"] = now_kst.isoformat()

    with open("data/watchlist.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n완료: data/watchlist.json 갱신 {'(변경있음)' if changed else '(변경없음)'}")


def get_naver_trades(hscp_no, target_area_m2=None):
    """네이버 실거래가 (로컬 전용)"""
    endpoints = [
        ("https://new.land.naver.com/api/complexes/" + hscp_no + "/real-prices", {"tradeType": "A1", "year": 3}),
        ("https://m.land.naver.com/complex/ajax/realPriceList",
         {"hscpNo": hscp_no, "tradeType": "A1", "year": 3, "rletTypeCd": "APT", "areaNo": ""}),
    ]
    raw_list = []
    for url, params in endpoints:
        try:
            r = requests.get(url, params=params, headers=NAVER_HEADERS, timeout=15)
            print(f"  실거래 조회 [{url.split('/')[2]}]: HTTP {r.status_code}")
            if r.status_code != 200:
                continue
            data = r.json()
            raw_list = data.get("realPriceList", data.get("list", data if isinstance(data, list) else []))
            if raw_list:
                break
        except Exception as e:
            print(f"  실거래 조회 실패: {e}")

    trades = []
    for t in raw_list:
        price_raw = t.get("dealAmt") or t.get("price") or t.get("tradePrice", 0)
        price = parse_price(price_raw) if isinstance(price_raw, str) else int(price_raw or 0) * 10_000
        area_str = str(t.get("exclusiveArea") or t.get("area") or t.get("spc2", "") or "").replace("㎡", "").strip()
        try:
            area_val = float(area_str) if area_str else 0.0
        except ValueError:
            area_val = 0.0
        date_str = str(t.get("tradeDate") or t.get("dealDate") or t.get("date", ""))
        if price > 0:
            trades.append({"area": area_val, "amount": price, "date": date_str})

    trades.sort(key=lambda x: x["date"], reverse=True)
    if target_area_m2 and target_area_m2 > 0:
        filtered = [t for t in trades if abs(t["area"] - target_area_m2) <= 5]
        if filtered:
            return filtered
    return trades


if __name__ == "__main__":
    main()
