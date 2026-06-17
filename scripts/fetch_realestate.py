"""
국토부 아파트 실거래가 공개 API → data/realestate.json 갱신
API: https://www.data.go.kr/data/15057511/openapi.do
환경변수: MOLIT_API_KEY (data.go.kr 발급)
실행: python scripts/fetch_realestate.py
"""
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
import urllib.request
import urllib.parse

API_KEY = os.environ.get('MOLIT_API_KEY', '')
BASE_URL = 'http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev'

REGIONS = {
    'gangnam':   {'code': '11680', 'name': '강남구'},
    'gangdong':  {'code': '11740', 'name': '강동구'},
    'mapo':      {'code': '11440', 'name': '마포구'},
    'dongjakgu': {'code': '11590', 'name': '동작구'},
    'yongsan':   {'code': '11170', 'name': '용산구'},
    'seongdong': {'code': '11200', 'name': '성동구'},
    'gwangjin':  {'code': '11215', 'name': '광진구'},
    'seongbuk':  {'code': '11290', 'name': '성북구'},
    'nowon':     {'code': '11350', 'name': '노원구'},
    'dobong':    {'code': '11320', 'name': '도봉구'},
    'eunpyeong': {'code': '11380', 'name': '은평구'},
    'seodaemun': {'code': '11410', 'name': '서대문구'},
    'jongno':    {'code': '11110', 'name': '종로구'},
    'jung':      {'code': '11140', 'name': '중구'},
    'jungnang':  {'code': '11260', 'name': '중랑구'},
    'gwanak':    {'code': '11545', 'name': '관악구'},
    'seocho':    {'code': '11650', 'name': '서초구'},
    'songpa':    {'code': '11710', 'name': '송파구'},
    'gangbuk':   {'code': '11305', 'name': '강북구'},
    'gangseo':   {'code': '11500', 'name': '강서구'},
    'guro':      {'code': '11530', 'name': '구로구'},
    'geumcheon': {'code': '11545', 'name': '금천구'},
    'yeongdeungpo': {'code': '11560', 'name': '영등포구'},
    'yangcheon': {'code': '11470', 'name': '양천구'},
    'dongjak':   {'code': '11590', 'name': '동작구'},
    'pangyo':    {'code': '41135', 'name': '성남시 분당구'},
}

def fetch_trades(lawd_cd: str, deal_ymd: str) -> list:
    params = urllib.parse.urlencode({
        'serviceKey': API_KEY,
        'LAWD_CD': lawd_cd,
        'DEAL_YMD': deal_ymd,
        'numOfRows': '100',
        'pageNo': '1',
    })
    url = f'{BASE_URL}?{params}'
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            raw = resp.read().decode('utf-8')
        items = []
        import re
        for item_match in re.finditer(r'<item>(.*?)</item>', raw, re.DOTALL):
            item_xml = item_match.group(1)
            def get_val(tag):
                m = re.search(fr'<{tag}>(.*?)</{tag}>', item_xml)
                return m.group(1).strip() if m else ''
            price_str = get_val('거래금액').replace(',', '')
            if not price_str:
                continue
            items.append({
                'name': get_val('아파트'),
                'area': get_val('전용면적'),
                'price': int(price_str) * 10000,
                'floor': int(get_val('층') or 0),
                'date': f"{get_val('년')}-{get_val('월').zfill(2)}-{get_val('일').zfill(2)}",
            })
        return items
    except Exception as e:
        print(f"  오류: {e}", file=sys.stderr)
        return []

def build_complex_summary(region_id: str, region_name: str, trades: list) -> list:
    from collections import defaultdict
    by_complex = defaultdict(list)
    for t in trades:
        key = f"{t['name']}-{t['area']}"
        by_complex[key].append(t)

    complexes = []
    for key, ts in by_complex.items():
        if len(ts) < 1:
            continue
        name = ts[0]['name']
        area = float(ts[0]['area'])
        prices = sorted([t['price'] for t in ts])
        complexes.append({
            'id': f"{region_id}-{name[:10].lower().replace(' ', '-')}",
            'name': name,
            'region': region_name,
            'regionId': region_id,
            'areaM2': round(area),
            'recentPrice': prices[-1],
            'low12m': prices[0],
            'high12m': prices[-1],
            'priceChange3y': None,
            'priceChange5y': None,
            'monthlyVolumeAvg': len(ts),
            'leasePriceRate': None,
            'newSupply2y': None,
            'trades': [{'date': t['date'], 'price': t['price'], 'floor': t['floor']} for t in ts[-5:]],
        })
    return complexes

def main():
    if not API_KEY:
        print("MOLIT_API_KEY 환경변수 미설정 — 스텁 유지", file=sys.stderr)
        sys.exit(0)

    now = datetime.now()
    months = [(now - timedelta(days=30 * i)).strftime('%Y%m') for i in range(3)]

    out_path = Path('data/realestate.json')
    existing = json.loads(out_path.read_text(encoding='utf-8')) if out_path.exists() else {'complexes': []}
    existing_map = {c['id']: c for c in existing.get('complexes', [])}

    all_complexes = []
    for region_id, info in REGIONS.items():
        print(f"조회: {info['name']}...")
        trades = []
        for ym in months:
            trades += fetch_trades(info['code'], ym)
        new_complexes = build_complex_summary(region_id, info['name'], trades)
        for c in new_complexes:
            if c['id'] in existing_map:
                old = existing_map[c['id']]
                c['leasePriceRate'] = old.get('leasePriceRate')
                c['newSupply2y'] = old.get('newSupply2y')
                c['priceChange3y'] = old.get('priceChange3y')
                c['priceChange5y'] = old.get('priceChange5y')
        all_complexes += new_complexes

    result = {
        'updatedAt': now.strftime('%Y-%m-%d'),
        'complexes': all_complexes,
    }
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"완료: {len(all_complexes)}개 단지 → data/realestate.json")

if __name__ == '__main__':
    main()
