"""A상점 카탈로그 시드 (멱등). 실행: python -m app.seed_shop

아이템 이미지는 아직 에셋이 없으므로 'emoji:🎩' 규약의 플레이스홀더를 쓴다.
클라이언트는 image_url이 'emoji:'로 시작하면 이모지를 크게 렌더링한다.
(SPEC §3.4: 그래픽은 나중에 통째로 교체 가능해야 함 — URL만 바꾸면 됨)

주의: 한글이 포함된 시드는 반드시 이 파일처럼 UTF-8 .py로 실행한다.
Windows 셸에서 `python -c "…한글…"` 인라인은 인코딩이 깨진다 (2026-07-04 확인).
"""

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models.shop import ShopItem

# (category, name, price, emoji, layer_z)
CATALOG: list[tuple[str, str, int, str, int]] = [
    ("hair", "핑크 단발", 40, "emoji:💇‍♀️", 50),
    ("hair", "갈색 긴머리", 40, "emoji:👩", 50),
    ("top", "하얀 티셔츠", 25, "emoji:👕", 30),
    ("top", "노란 후드", 45, "emoji:🧥", 30),
    ("bottom", "청바지", 30, "emoji:👖", 20),
    ("dress", "분홍 원피스", 60, "emoji:👗", 35),
    ("shoes", "운동화", 20, "emoji:👟", 10),
    ("shoes", "구두", 35, "emoji:👠", 10),
    ("sunglasses", "선글라스", 15, "emoji:🕶️", 60),
    ("accessory", "리본 머리핀", 10, "emoji:🎀", 65),
    ("accessory", "왕관", 80, "emoji:👑", 65),
    ("bag", "백팩", 30, "emoji:🎒", 40),
    ("background", "벚꽃 배경", 50, "emoji:🌸", 0),
    ("background", "바다 배경", 50, "emoji:🌊", 0),
    ("pet", "강아지", 70, "emoji:🐶", 45),
    ("pet", "고양이", 70, "emoji:🐱", 45),
    ("misc", "풍선", 12, "emoji:🎈", 55),
]


def seed_shop() -> None:
    db = SessionLocal()
    try:
        created = 0
        for category, name, price, image_url, layer_z in CATALOG:
            exists = db.scalar(
                select(ShopItem).where(ShopItem.category == category, ShopItem.name == name)
            )
            if exists is not None:
                continue
            db.add(
                ShopItem(
                    category=category,
                    name=name,
                    price=price,
                    image_url=image_url,
                    layer_z=layer_z,
                )
            )
            created += 1
        db.commit()
        print(f"shop seed: {created} created, {len(CATALOG) - created} skipped")
    finally:
        db.close()


if __name__ == "__main__":
    seed_shop()
