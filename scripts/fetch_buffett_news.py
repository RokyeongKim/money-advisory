"""
Warren Buffett 관련 최신 뉴스 + 명언 자동 수집
- Google News RSS: 버핏/버크셔 최신 기사
- 명언은 정적 목록 (변경 없음)
"""
import json, requests
from datetime import datetime, timezone, timedelta
from xml.etree import ElementTree as ET

KST = timezone(timedelta(hours=9))

BUFFETT_QUOTES = [
    {"text": "Rule No.1: Never lose money. Rule No.2: Never forget rule No.1.", "source": "Berkshire Hathaway Shareholder Letter"},
    {"text": "Price is what you pay. Value is what you get.", "source": "2008 Shareholder Letter"},
    {"text": "Be fearful when others are greedy, and greedy when others are fearful.", "source": "2004 Shareholder Letter"},
    {"text": "Our favorite holding period is forever.", "source": "1988 Shareholder Letter"},
    {"text": "It's far better to buy a wonderful company at a fair price than a fair company at a wonderful price.", "source": "1989 Shareholder Letter"},
    {"text": "The stock market is a device for transferring money from the impatient to the patient.", "source": "Various interviews"},
    {"text": "I never attempt to make money on the stock market. I buy on the assumption that they could close the market the next day and not reopen it for five years.", "source": "Various interviews"},
    {"text": "Someone's sitting in the shade today because someone planted a tree a long time ago.", "source": "Various speeches"},
]


def fetch_google_news():
    """Google News RSS에서 Warren Buffett 최신 기사 10건 수집"""
    url = (
        "https://news.google.com/rss/search"
        "?q=Warren+Buffett+OR+Berkshire+Hathaway"
        "&hl=en-US&gl=US&ceid=US:en"
    )
    try:
        res = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        res.raise_for_status()
        root = ET.fromstring(res.content)
        channel = root.find("channel")
        if channel is None:
            return []

        items = []
        for item in channel.findall("item")[:10]:
            raw_title = item.findtext("title", "")
            # "기사 제목 - 언론사" 형식에서 분리
            if " - " in raw_title:
                title  = raw_title.rsplit(" - ", 1)[0].strip()
                source = raw_title.rsplit(" - ", 1)[1].strip()
            else:
                title  = raw_title
                source = item.findtext("{http://www.google.com/schemas/news}articleSource", "")

            link     = item.findtext("link", "")
            pub_date = item.findtext("pubDate", "")
            try:
                dt       = datetime.strptime(pub_date, "%a, %d %b %Y %H:%M:%S %Z")
                date_str = dt.strftime("%Y-%m-%d")
            except Exception:
                date_str = pub_date[:10] if len(pub_date) >= 10 else ""

            items.append({"title": title, "date": date_str, "source": source, "link": link})
        return items

    except Exception as e:
        print(f"Google News fetch error: {e}")
        return []


def main():
    print("Fetching Buffett news...")
    news = fetch_google_news()
    print(f"  → {len(news)}건 수집")

    now = datetime.now(KST).strftime("%Y-%m-%d")
    out = {
        "updatedAt": now,
        "news":   news,
        "quotes": BUFFETT_QUOTES,
    }
    with open("data/buffett_news.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"  → data/buffett_news.json 저장 완료")


if __name__ == "__main__":
    main()
