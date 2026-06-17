"""
메르 블로그 (blog.naver.com/ranto28) RSS 파싱
포트폴리오/운용 관련 글을 isPortfolio=true로 태깅
"""
import json, re
from datetime import datetime
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

RSS_URL = "https://rss.blog.naver.com/ranto28.xml"
OUT = Path(__file__).parent.parent / "data" / "mer_blog.json"
HEADERS = {"User-Agent": "asset-dashboard junsun8k@gmail.com"}

PORTFOLIO_KEYWORDS = [
    "포트폴리오", "운용", "투자 현황", "주식 현황", "보유", "비중",
    "매수", "매도", "리밸런싱", "배분", "자산", "ETF", "펀드",
]


def is_portfolio_post(title: str, summary: str = "") -> bool:
    text = (title + " " + summary).lower()
    return any(kw in text for kw in PORTFOLIO_KEYWORDS)


def parse_rss(xml_text: str) -> list[dict]:
    root = ET.fromstring(xml_text)
    channel = root.find("channel")
    posts = []
    for item in (channel.findall("item") if channel is not None else []):
        def g(tag):
            el = item.find(tag)
            return el.text.strip() if el is not None and el.text else ""
        title = g("title")
        link = g("link")
        pub_date = g("pubDate")
        description = re.sub(r"<[^>]+>", "", g("description"))[:200]
        try:
            dt = datetime.strptime(pub_date[:25], "%a, %d %b %Y %H:%M:%S")
            date_str = dt.strftime("%Y-%m-%d")
        except Exception:
            date_str = pub_date[:10]
        posts.append({
            "title": title,
            "link": link,
            "date": date_str,
            "summary": description,
            "isPortfolio": is_portfolio_post(title, description),
        })
    return posts


def run():
    print("메르 블로그 RSS 파싱 중...")
    req = urllib.request.Request(RSS_URL, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            xml_text = r.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"RSS 가져오기 실패: {e}")
        return

    posts = parse_rss(xml_text)
    portfolio_count = sum(1 for p in posts if p["isPortfolio"])
    print(f"전체 글: {len(posts)}개, 포트폴리오 관련: {portfolio_count}개")

    result = {
        "updatedAt": datetime.now().strftime("%Y-%m-%d"),
        "source": "네이버 블로그 메르 (ranto28)",
        "sourceUrl": "https://blog.naver.com/ranto28",
        "posts": posts,
    }

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"저장 완료: {OUT}")
    for p in posts[:3]:
        flag = "📊" if p["isPortfolio"] else "  "
        print(f"  {flag} [{p['date']}] {p['title']}")


if __name__ == "__main__":
    run()
