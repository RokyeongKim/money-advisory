"""
Google Sheets에서 예금/적금/코인 등 자산 데이터 자동 조회 (Service Account 인증)
시트 컬럼: 자산보유자, 자산종류, 기관명, 평가규모, 입금일, 만기일, 수익률(금리), 기준시점
인증: GitHub Secret GOOGLE_SA_JSON (서비스 계정 JSON 키)
"""
import json, os, re
from datetime import datetime, timezone, timedelta

import gspread
from google.oauth2.service_account import Credentials

KST = timezone(timedelta(hours=9))
SHEET_ID = "1pzKmHxuYtbIVS6Xn2RM5V3Iaku_xxjooOu7ndxBRwPQ"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

# 컬럼명 별칭 매핑 (시트에서 다양하게 쓸 수 있는 이름들 → 정규 키)
COL_ALIASES = {
    "owner":       ["자산보유자", "보유자", "owner"],
    "type":        ["자산종류", "종류", "type"],
    "institution": ["기관명", "기관", "금융기관", "은행", "institution"],
    "amount":      ["평가규모", "평가금액", "금액", "규모", "잔액", "amount"],
    "depositDate": ["입금일", "가입일", "시작일", "depositdate", "start"],
    "maturityDate":["만기일", "만기", "maturitydate", "end"],
    "rate":        ["수익률(금리)", "수익률", "금리", "이율", "rate"],
    "asOf":        ["기준시점", "기준일", "업데이트", "asof", "updated"],
}

def normalize(s):
    return re.sub(r'\s+', '', str(s)).lower()

def build_col_map(headers):
    """헤더 리스트 → {정규키: 헤더인덱스} 매핑 (정확 → 부분 매칭 순)"""
    alias_lookup = {}
    for key, aliases in COL_ALIASES.items():
        for a in aliases:
            alias_lookup[normalize(a)] = key

    col_map = {}
    for i, h in enumerate(headers):
        norm = normalize(h)
        if norm in alias_lookup:
            key = alias_lookup[norm]
            if key not in col_map:
                col_map[key] = i

    # 정확 매칭으로 못 찾은 필드: 헤더 이름에 키워드 포함 시 부분 매칭
    PARTIAL = {
        "rate":   ["금리", "수익률", "이율"],
        "amount": ["금액", "규모", "잔액"],
    }
    for i, h in enumerate(headers):
        norm = normalize(h)
        for key, terms in PARTIAL.items():
            if key not in col_map and any(t in norm for t in terms):
                col_map[key] = i
                break

    return col_map


def get_sheet_records():
    sa_json = os.environ.get("GOOGLE_SA_JSON")
    if not sa_json:
        raise EnvironmentError("GOOGLE_SA_JSON 환경변수가 없습니다. GitHub Secret을 확인하세요.")
    creds = Credentials.from_service_account_info(json.loads(sa_json), scopes=SCOPES)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(SHEET_ID).sheet1

    all_values = sheet.get_all_values()
    if not all_values:
        return []

    # '자산보유자'(또는 별칭) 컬럼이 있는 행을 헤더로 자동 감지
    owner_aliases = {normalize(a) for a in COL_ALIASES["owner"]}
    header_row_idx = None
    for i, row in enumerate(all_values):
        if any(normalize(cell) in owner_aliases for cell in row):
            header_row_idx = i
            break

    if header_row_idx is None:
        print("  '자산보유자' 헤더를 찾을 수 없습니다.")
        return []

    headers = all_values[header_row_idx]
    col_map = build_col_map(headers)
    data_rows = all_values[header_row_idx + 1:]

    print(f"  헤더 행: {header_row_idx + 1}번째 줄")
    print(f"  실제 컬럼: {[h for h in headers if h.strip()]}")
    print(f"  컬럼 매핑: {col_map}")
    print(f"  데이터 행 수: {len(data_rows)}")

    def cell(row, key):
        idx = col_map.get(key)
        if idx is None:
            return ""
        return row[idx] if idx < len(row) else ""

    records = []
    for row in data_rows:
        if not any(c.strip() for c in row):
            continue
        records.append({key: cell(row, key) for key in COL_ALIASES})
    return records


def parse_amount(s):
    if not s and s != 0:
        return 0
    cleaned = str(s).strip().replace(",", "").replace("원", "").replace(" ", "").replace("₩", "")
    try:
        return int(float(cleaned))
    except ValueError:
        return 0


def parse_rate(s):
    if not s and s != 0:
        return None
    nums = re.findall(r'\d+\.?\d*', str(s))
    return float(nums[0]) if nums else None


def main():
    now = datetime.now(KST).isoformat()
    empty = {"updatedAt": now, "items": [], "totalKnk": 0, "totalLch": 0, "grandTotal": 0}

    try:
        records = get_sheet_records()
    except Exception as e:
        print(f"  시트 불러오기 실패: {e}")
        with open("data/deposits.json", "w", encoding="utf-8") as f:
            json.dump(empty, f, ensure_ascii=False)
        return

    # 업비트 실시간으로 대체되는 타입 → 합계 제외 (표시는 유지)
    REALTIME_TYPES = {"코인", "비트코인", "비트코인(업비트)", "이더리움", "가상자산"}

    items = []
    total_knk = 0
    total_lch = 0

    for row in records:
        owner = str(row.get("owner", "")).strip()
        if not owner:
            continue

        amount = parse_amount(row.get("amount", 0))
        rate = parse_rate(row.get("rate", ""))
        asset_type = str(row.get("type", "")).strip()
        is_realtime = asset_type in REALTIME_TYPES

        item = {
            "owner": owner,
            "type": asset_type,
            "institution": str(row.get("institution", "")).strip(),
            "amount": amount,
            "depositDate": str(row.get("depositDate", "")).strip(),
            "maturityDate": str(row.get("maturityDate", "")).strip(),
            "rate": rate,
            "asOf": str(row.get("asOf", "")).strip(),
            "realtimeSource": "upbit" if is_realtime else None,
        }
        items.append(item)

        # 업비트 실시간 대체 항목은 합계에서 제외
        if not is_realtime:
            if owner == "김노경":
                total_knk += amount
            elif owner == "이창헌":
                total_lch += amount

    grand_total = total_knk + total_lch
    print(f"  예금/적금: 총 ₩{grand_total:,} ({len(items)}건, 코인 제외)")
    print(f"    김노경: ₩{total_knk:,}  이창헌: ₩{total_lch:,}")

    with open("data/deposits.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "updatedAt": now,
                "items": items,
                "totalKnk": total_knk,
                "totalLch": total_lch,
                "grandTotal": grand_total,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


if __name__ == "__main__":
    main()
