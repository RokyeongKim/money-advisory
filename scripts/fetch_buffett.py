"""
Berkshire Hathaway 13F-HR 파싱 → data/buffett.json 저장
SEC EDGAR API 사용 (무료, 인증 불필요)
"""
import json, re, time
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

HEADERS = {"User-Agent": "asset-dashboard junsun8k@gmail.com"}
BRK_CIK = "0001067983"
BRK_ENTITY_ID = "1067983"
OUT = Path(__file__).parent.parent / "data" / "buffett.json"


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", errors="replace")


def get_latest_13f():
    url = f"https://data.sec.gov/submissions/CIK{BRK_CIK}.json"
    data = json.loads(fetch(url))
    filings = data["filings"]["recent"]
    for i, form in enumerate(filings["form"]):
        if form == "13F-HR":
            return {
                "accessionNumber": filings["accessionNumber"][i],
                "reportDate": filings["reportDate"][i],
                "filingDate": filings["filingDate"][i],
            }
    return None


def get_infotable_url(accession_dashed):
    """파일링 인덱스 페이지에서 infotable XML URL 찾기"""
    accession_nodash = accession_dashed.replace("-", "")
    base = f"https://www.sec.gov/Archives/edgar/data/{BRK_ENTITY_ID}/{accession_nodash}/"
    html = fetch(base)

    # infotable 파일 우선, 그 다음 일반 XML
    patterns = [
        r'href="([^"]*infotable[^"]*\.xml)"',
        r'href="([^"]*13fhr[^"]*\.xml)"',
        r'href="([^"]*form13f[^"]*\.xml)"',
        r'href="(/Archives/edgar/data/' + BRK_ENTITY_ID + r'/[^"]+\.xml)"',
    ]
    for pat in patterns:
        m = re.search(pat, html, re.IGNORECASE)
        if m:
            url = m.group(1)
            return url if url.startswith("http") else "https://www.sec.gov" + url

    return None


def strip_namespace(xml_text):
    """xmlns 선언과 네임스페이스 프리픽스를 제거해 파싱을 단순화"""
    xml_text = re.sub(r'\s+xmlns(?::\w+)?="[^"]*"', '', xml_text)
    xml_text = re.sub(r'<(/?)[\w]+:([\w])', r'<\1\2', xml_text)
    return xml_text


def parse_infotable(xml_text):
    clean = strip_namespace(xml_text)
    root = ET.fromstring(clean)

    holdings = []
    # 대소문자 모두 시도
    infotables = root.findall('.//infoTable') or root.findall('.//InfoTable') or root.findall('.//INFOTABLE')
    for info in infotables:
        def g(tag):
            el = info.find(tag) or info.find(tag.lower()) or info.find(tag.upper())
            return el.text.strip() if el is not None and el.text else ""

        name = g("nameOfIssuer")
        value_str = g("value") or "0"
        value = int(re.sub(r"[^\d]", "", value_str) or "0") * 1000  # 천달러 단위

        sha = info.find("shrsOrPrnAmt") or info.find("shrsOrPrnamtAmt")
        shares = 0
        if sha is not None:
            sh_el = sha.find("sshPrnamt") or sha.find("Sshprnamt")
            if sh_el is not None and sh_el.text:
                shares = int(re.sub(r"[^\d]", "", sh_el.text) or "0")

        holdings.append({"name": name, "valueUsd": value, "shares": shares})

    return holdings


def run():
    print("Fetching Berkshire 13F from SEC EDGAR...")
    latest = get_latest_13f()
    if not latest:
        print("ERROR: 13F 파일링을 찾을 수 없습니다.")
        return

    print(f"최신 13F: {latest['reportDate']} (제출: {latest['filingDate']})")
    time.sleep(0.5)

    table_url = get_infotable_url(latest["accessionNumber"])
    if not table_url:
        print("ERROR: infotable XML URL을 찾을 수 없습니다.")
        return

    print(f"infotable URL: {table_url}")
    time.sleep(0.5)
    xml_text = fetch(table_url)
    holdings = parse_infotable(xml_text)
    print(f"파싱된 항목 수: {len(holdings)}")

    total = sum(h["valueUsd"] for h in holdings)
    for h in holdings:
        h["pct"] = round(h["valueUsd"] / total * 100, 2) if total else 0

    holdings.sort(key=lambda h: h["valueUsd"], reverse=True)
    top30 = holdings[:30]

    quarter_month = int(latest["reportDate"][5:7])
    quarter = f"{latest['reportDate'][:4]}Q{(quarter_month - 1) // 3 + 1}"

    result = {
        "updatedAt": latest["filingDate"],
        "quarter": quarter,
        "reportDate": latest["reportDate"],
        "source": "SEC EDGAR 13F-HR (CIK: 0001067983)",
        "sourceUrl": "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001067983&type=13F&dateb=&owner=include&count=5",
        "totalValueUsd": total,
        "holdings": top30,
    }

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f" 저장 완료: {OUT}")
    for h in top30[:5]:
        print(f"  {h['name']}: {h['pct']}% (${h['valueUsd']:,})")


if __name__ == "__main__":
    run()
