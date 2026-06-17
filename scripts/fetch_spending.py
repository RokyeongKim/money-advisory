import os
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

OB_ACCESS_TOKEN = os.environ.get('OB_ACCESS_TOKEN', '')
OB_API_BASE = 'https://openapi.openbanking.or.kr'

def fetch_transactions(access_token: str, days: int = 30) -> list:
    if not access_token:
        print('OB_ACCESS_TOKEN not set — skipping spending fetch')
        return []

    from_date = (datetime.now() - timedelta(days=days)).strftime('%Y%m%d')
    to_date = datetime.now().strftime('%Y%m%d')

    headers = {'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'}
    params = {
        'bank_tran_id': f'M202506001_{datetime.now().strftime("%Y%m%d%H%M%S")}',
        'fintech_use_num': os.environ.get('OB_FINTECH_USE_NUM', ''),
        'inquiry_type': 'A',
        'inquiry_base': 'D',
        'from_date': from_date,
        'to_date': to_date,
        'sort_order': 'D',
    }

    try:
        import urllib.request
        import urllib.parse
        url = f'{OB_API_BASE}/v2.0/account/transaction/list?' + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        raw = data.get('res_list', [])
        return [
            {
                'date': t['tran_date'],
                'amount': abs(int(t['tran_amt'].replace(',', ''))),
                'category': t.get('print_content', '기타'),
                'memo': t.get('remark', ''),
            }
            for t in raw
            if int(t['tran_amt'].replace(',', '')) < 0
        ]
    except Exception as e:
        print(f'Open Banking API error: {e}', file=sys.stderr)
        return []

def main():
    records = fetch_transactions(OB_ACCESS_TOKEN, days=90)
    output = {
        'records': records,
        'updatedAt': datetime.now().isoformat(),
        'source': 'openbanking',
    }
    Path('data').mkdir(exist_ok=True)
    Path('data/spending.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Saved {len(records)} spending records to data/spending.json')

if __name__ == '__main__':
    main()
