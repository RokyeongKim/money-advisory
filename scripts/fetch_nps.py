"""
국민연금 포트폴리오 자동 수집
- 자산배분: fund.nps.or.kr 공시 스크래핑 시도
- 실패 시 기존 data/nps.json 유지 (수동 업데이트)
- 주요 보유 종목: DART 대량보유 현황 기반
"""
import json, requests
from datetime import datetime, timezone, timedelta
from xml.etree import ElementTree as ET

KST = timezone(timedelta(hours=9))


def fetch_nps_allocation():
    """
    국민연금 기금운용현황 페이지에서 자산배분 데이터 시도.
    대부분 JS 렌더링이라 실패 시 None 반환.
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://fund.nps.or.kr",
        }
        # 국민연금 기금운용현황 공시 페이지 (텍스트 파싱 시도)
        res = requests.get(
            "https://fund.nps.or.kr/jsppage/fund/mcs/mcs_03_01.jsp",
            headers=headers, timeout=15,
        )
        if res.status_code == 200 and "자산배분" in res.text:
            print("  fund.nps.or.kr 접근 성공 — 파싱 시도")
            # TODO: 페이지 구조에 따라 BeautifulSoup 파싱 추가
        else:
            print(f"  fund.nps.or.kr 파싱 불가 (status {res.status_code})")
    except Exception as e:
        print(f"  NPS 스크래핑 실패: {e}")
    return None


def fetch_nps_news():
    """국민연금 관련 최신 뉴스 (Google News RSS)"""
    url = (
        "https://news.google.com/rss/search"
        "?q=%EA%B5%AD%EB%AF%BC%EC%97%B0%EA%B8%88+%ED%8F%AC%ED%8A%B8%ED%8F%B4%EB%A6%AC%EC%98%A4+OR+%EA%B5%AD%EB%AF%BC%EC%97%B0%EA%B8%88+%EC%A3%BC%EC%8B%9D"
        "&hl=ko&gl=KR&ceid=KR:ko"
    )
    try:
        res = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        res.raise_for_status()
        root = ET.fromstring(res.content)
        channel = root.find("channel")
        if channel is None:
            return []
        items = []
        for item in channel.findall("item")[:8]:
            raw_title = item.findtext("title", "")
            if " - " in raw_title:
                title  = raw_title.rsplit(" - ", 1)[0].strip()
                source = raw_title.rsplit(" - ", 1)[1].strip()
            else:
                title, source = raw_title, ""
            pub_date = item.findtext("pubDate", "")
            try:
                dt = datetime.strptime(pub_date, "%a, %d %b %Y %H:%M:%S %Z")
                date_str = dt.strftime("%Y-%m-%d")
            except Exception:
                date_str = pub_date[:10] if len(pub_date) >= 10 else ""
            items.append({
                "title":  title,
                "date":   date_str,
                "source": source,
                "link":   item.findtext("link", ""),
            })
        return items
    except Exception as e:
        print(f"  NPS 뉴스 수집 실패: {e}")
        return []


def main():
    print("Fetching NPS data...")

    # 기존 파일 로드 (자산배분·보유종목은 수동 업데이트)
    try:
        with open("data/nps.json", encoding="utf-8") as f:
            existing = json.load(f)
    except Exception:
        existing = {}

    # 스크래핑 시도 (현재는 fallback)
    allocation_data = fetch_nps_allocation()  # None이면 기존 유지

    # 최신 뉴스 추가
    news = fetch_nps_news()
    print(f"  뉴스 {len(news)}건 수집")

    out = {
        **existing,
        "news": news,
        "newsUpdatedAt": datetime.now(KST).strftime("%Y-%m-%d"),
    }
    if allocation_data:
        out["assetAllocation"] = allocation_data["assetAllocation"]
        out["updatedAt"] = allocation_data["updatedAt"]

    with open("data/nps.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("  → data/nps.json 저장 완료")


if __name__ == "__main__":
    main()
