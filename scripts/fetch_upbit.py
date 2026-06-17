"""
업비트 Open API — 잔고 조회 (자산 조회 권한만 사용)
GitHub Secrets: UPBIT_ACCESS_KEY, UPBIT_SECRET_KEY
"""
import base64, hashlib, hmac, json, os, uuid
from datetime import datetime, timezone, timedelta
import requests

KST = timezone(timedelta(hours=9))


def b64url(data: str) -> str:
    if isinstance(data, str):
        data = data.encode()
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def make_jwt(access_key: str, secret_key: str) -> str:
    header  = b64url(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')))
    payload = b64url(json.dumps({'access_key': access_key, 'nonce': str(uuid.uuid4())}, separators=(',', ':')))
    signing = f'{header}.{payload}'
    sig = b64url(hmac.new(secret_key.encode(), signing.encode(), hashlib.sha256).digest())
    return f'Bearer {signing}.{sig}'


def main():
    now   = datetime.now(KST).isoformat()
    empty = {'updatedAt': now, 'holdings': [], 'totalPurchaseKrw': 0, 'totalEvalKrw': 0, 'error': None}

    access_key = os.environ.get('UPBIT_ACCESS_KEY', '').strip()
    secret_key = os.environ.get('UPBIT_SECRET_KEY', '').strip()

    if not access_key or not secret_key:
        print('  UPBIT_ACCESS_KEY / UPBIT_SECRET_KEY 미설정 — 건너뜀')
        with open('data/upbit.json', 'w', encoding='utf-8') as f:
            json.dump(empty, f, ensure_ascii=False)
        return

    try:
        token = make_jwt(access_key, secret_key)
        res   = requests.get('https://api.upbit.com/v1/accounts',
                             headers={'Authorization': token}, timeout=10)
        if res.status_code != 200:
            print(f'  업비트 오류: HTTP {res.status_code} — {res.text[:200]}')
            with open('data/upbit.json', 'w', encoding='utf-8') as f:
                json.dump({**empty, 'error': f'HTTP {res.status_code}'}, f, ensure_ascii=False)
            return

        accounts     = res.json()
        crypto_accts = [a for a in accounts
                        if a['currency'] != 'KRW'
                        and float(a['balance']) + float(a['locked']) > 0]

        if not crypto_accts:
            print('  업비트 코인 잔고 없음')
            with open('data/upbit.json', 'w', encoding='utf-8') as f:
                json.dump(empty, f, ensure_ascii=False)
            return

        markets    = ','.join(f'KRW-{a["currency"]}' for a in crypto_accts)
        ticker_res = requests.get(f'https://api.upbit.com/v1/ticker?markets={markets}', timeout=10)
        tickers    = ticker_res.json() if ticker_res.ok else []
        price_map  = {t['market']: t['trade_price'] for t in tickers}

        total_purchase, total_eval = 0, 0
        holdings = []
        for a in crypto_accts:
            qty          = float(a['balance']) + float(a['locked'])
            avg_buy      = float(a['avg_buy_price'])
            cur_price    = price_map.get(f'KRW-{a["currency"]}', 0)
            purchase_krw = round(qty * avg_buy)
            eval_krw     = round(qty * cur_price)
            total_purchase += purchase_krw
            total_eval     += eval_krw
            pnl_pct = round((cur_price / avg_buy - 1) * 10000) / 100 if avg_buy > 0 else 0
            holdings.append({
                'currency': a['currency'], 'qty': qty,
                'avgBuyPrice': avg_buy, 'currentPrice': cur_price,
                'purchaseKrw': purchase_krw, 'evalKrw': eval_krw, 'pnlPct': pnl_pct,
            })

        print(f'  업비트: {len(holdings)}종목, 총평가 ₩{total_eval:,}')
        with open('data/upbit.json', 'w', encoding='utf-8') as f:
            json.dump({
                'updatedAt': now, 'holdings': holdings,
                'totalPurchaseKrw': total_purchase, 'totalEvalKrw': total_eval, 'error': None,
            }, f, ensure_ascii=False, indent=2)

    except Exception as e:
        print(f'  업비트 조회 실패: {e}')
        with open('data/upbit.json', 'w', encoding='utf-8') as f:
            json.dump({**empty, 'error': str(e)}, f, ensure_ascii=False)


if __name__ == '__main__':
    main()
