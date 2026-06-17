"""
서울시 정비사업 현황 크롤링 → data/signals.json 갱신
주의: source == '수동'인 항목 보존, updatedAt만 갱신
실행: python scripts/fetch_signals.py
"""
import json
import sys
from datetime import datetime
from pathlib import Path

def main():
    out_path = Path('data/signals.json')
    if not out_path.exists():
        print("data/signals.json 없음 — Task 1에서 생성 필요", file=sys.stderr)
        sys.exit(1)

    data = json.loads(out_path.read_text(encoding='utf-8'))
    data['updatedAt'] = datetime.now().strftime('%Y-%m-%d')

    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"완료: signals.json updatedAt → {data['updatedAt']}")
    print("수동 편집 필요: 새로운 시그널은 data/signals.json에 직접 추가하세요.")

if __name__ == '__main__':
    main()
