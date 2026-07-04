"""A상점 카탈로그 시드 (멱등). 실행: python -m app.seed_shop

카테고리 체계·가격 티어: docs/research/item-catalog-plan.md (24카테고리, 4티어).
아이템 이미지는 아직 에셋이 없으므로 'emoji:🎩' 규약의 플레이스홀더를 쓴다.
클라이언트는 image_url이 'emoji:'로 시작하면 이모지를 렌더링한다.
(3D 전환 시 asset_ref가 추가되고 image_url은 썸네일로 유지 — TECH_DESIGN §7)

주의: 한글이 포함된 시드는 반드시 이 파일처럼 UTF-8 .py로 실행한다.
Windows 셸에서 `python -c "…한글…"` 인라인은 인코딩이 깨진다 (2026-07-04 확인).

layer_z 규칙: 음수 = 몸 뒤에 렌더(날개·꼬리·바닥). 카테고리별 값은 계획 문서 표를 따른다.
"""

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models.shop import ShopItem

# (category, name, price, emoji, layer_z)
CATALOG: list[tuple[str, str, int, str, int]] = [
    # ── 헤어 (50) ──
    ("hair", "핑크 단발", 40, "emoji:💇‍♀️", 50),
    ("hair", "갈색 긴머리", 40, "emoji:👩", 50),
    ("hair", "양갈래", 45, "emoji:👧", 50),
    ("hair", "포니테일", 40, "emoji:💁‍♀️", 50),
    # ── 상의 (30) ──
    ("top", "하얀 티셔츠", 25, "emoji:👕", 30),
    ("top", "노란 후드", 45, "emoji:🧥", 30),
    ("top", "블라우스", 28, "emoji:👚", 30),
    ("top", "포근한 니트", 35, "emoji:🧶", 30),
    ("top", "빨간 망토", 55, "emoji:🦸‍♀️", 30),
    # ── 하의 (20) ──
    ("bottom", "청바지", 30, "emoji:👖", 20),
    ("bottom", "반바지", 25, "emoji:🩳", 20),
    ("bottom", "튜튜 치마", 45, "emoji:🩰", 20),
    # ── 원피스 (35) ──
    ("dress", "분홍 원피스", 60, "emoji:👗", 35),
    ("dress", "고운 한복", 75, "emoji:🎎", 35),
    # ── 신발/양말 (10/8) ──
    ("shoes", "운동화", 20, "emoji:👟", 10),
    ("shoes", "구두", 35, "emoji:👠", 10),
    ("shoes", "레인부츠", 25, "emoji:🥾", 10),
    ("shoes", "쪼리", 15, "emoji:🩴", 10),
    ("socks", "줄무늬 양말", 12, "emoji:🧦", 8),
    # ── 눈: 선글라스/안경 (60) — 서로 충돌 ──
    ("sunglasses", "선글라스", 15, "emoji:🕶️", 60),
    ("glasses", "동그란 안경", 20, "emoji:👓", 60),
    ("glasses", "물놀이 고글", 22, "emoji:🥽", 60),
    # ── 모자 (68) ──
    ("hat", "볼캡", 25, "emoji:🧢", 68),
    ("hat", "밀짚모자", 30, "emoji:👒", 68),
    ("hat", "신사 모자", 55, "emoji:🎩", 68),
    ("hat", "학사모", 45, "emoji:🎓", 68),
    ("hat", "왕관", 80, "emoji:👑", 68),
    # ── 동물 귀 (58) ──
    ("ears", "고양이 귀", 45, "emoji:🐱", 58),
    ("ears", "토끼 귀", 45, "emoji:🐰", 58),
    # ── 액세서리: 머리 옆 (65) ──
    ("accessory", "리본 머리핀", 10, "emoji:🎀", 65),

    ("accessory", "꽃 머리핀", 15, "emoji:🌸", 65),
    # ── 목걸이 (55) ──
    ("necklace", "진주 목걸이", 35, "emoji:📿", 55),
    ("necklace", "다이아 목걸이", 70, "emoji:💎", 55),
    ("necklace", "포근한 목도리", 20, "emoji:🧣", 55),
    # ── 날개: 몸 뒤 (-5) ──
    ("wings", "천사 날개", 100, "emoji:🪽", -5),
    ("wings", "나비 날개", 90, "emoji:🦋", -5),
    # ── 꼬리: 몸 뒤 (-3) ──
    ("tail", "여우 꼬리", 50, "emoji:🦊", -3),
    # ── 머리 위 링 (70) ──
    ("halo", "천사링", 60, "emoji:😇", 70),
    # ── 손에 드는 것 (66) ──
    ("held", "마법 지팡이", 45, "emoji:🪄", 66),
    ("held", "아이스크림", 15, "emoji:🍦", 66),
    ("held", "꽃다발", 30, "emoji:💐", 66),
    ("held", "노란 우산", 25, "emoji:☂️", 66),
    # ── 얼굴 스티커 (61) ──
    ("face", "별 스티커", 12, "emoji:⭐", 61),
    ("face", "하트 스티커", 12, "emoji:💖", 61),
    # ── 이펙트: 최고가 티어 (72) ──
    ("effect", "반짝반짝 오라", 120, "emoji:✨", 72),
    ("effect", "하트 뿅뿅", 110, "emoji:💞", 72),
    # ── 가방 (40) ──
    ("bag", "백팩", 30, "emoji:🎒", 40),
    ("bag", "미니 크로스백", 28, "emoji:👝", 40),
    ("bag", "여행 캐리어", 45, "emoji:🧳", 40),
    # ── 배경 (0) ──
    ("background", "벚꽃 배경", 50, "emoji:🌸", 0),
    ("background", "바다 배경", 50, "emoji:🌊", 0),
    ("background", "밤하늘", 55, "emoji:🌃", 0),
    ("background", "무지개", 60, "emoji:🌈", 0),
    ("background", "우주", 70, "emoji:🪐", 0),
    ("background", "크리스마스", 65, "emoji:🎄", 0),
    # ── 바닥: 발 아래 (-8) ──
    ("floor", "꽃밭 러그", 40, "emoji:🌼", -8),
    ("floor", "구름 방석", 35, "emoji:☁️", -8),
    # ── 펫 (45) ──
    ("pet", "강아지", 70, "emoji:🐶", 45),
    ("pet", "고양이", 70, "emoji:🐱", 45),
    ("pet", "햄스터", 60, "emoji:🐹", 45),
    ("pet", "앵무새", 65, "emoji:🦜", 45),
    ("pet", "유니콘", 120, "emoji:🦄", 45),
    # ── 소품 (55) ──
    ("misc", "풍선", 12, "emoji:🎈", 55),
    ("misc", "비눗방울", 15, "emoji:🫧", 55),
    ("misc", "곰인형", 25, "emoji:🧸", 55),
    ("misc", "반짝 트로피", 50, "emoji:🏆", 55),
]


# ─────────────────────────────────────────────────────────────────
# 3D 적용 참조 (TECH_DESIGN §7.2) — "상점 아이템 = 실제로 3D 캐릭터에 착용 가능한 것"
# 이 맵에 있는 아이템만 판매 활성화한다. 없는 아이템은 is_active=false
# (VRoid 에셋이 생기면 참조를 채우고 재활성 — B-2).
# prop: 뼈 부착 3D 프롭 / fx: 파티클 이펙트 / env: 무대 배경 프리셋
# ─────────────────────────────────────────────────────────────────
ASSET_REFS: dict[tuple[str, str], str] = {
    ("hat", "볼캡"): "prop:cap",
    ("hat", "밀짚모자"): "prop:straw_hat",
    ("hat", "신사 모자"): "prop:top_hat",
    ("hat", "학사모"): "prop:grad_cap",
    ("glasses", "동그란 안경"): "prop:round_glasses",
    ("glasses", "물놀이 고글"): "prop:goggles",
    ("sunglasses", "선글라스"): "prop:sunglasses",
    ("ears", "고양이 귀"): "prop:cat_ears",
    ("ears", "토끼 귀"): "prop:rabbit_ears",
    ("halo", "천사링"): "prop:halo",
    ("hat", "왕관"): "prop:crown",
    ("accessory", "리본 머리핀"): "prop:ribbon_pin",
    ("accessory", "꽃 머리핀"): "prop:flower_pin",
    ("necklace", "진주 목걸이"): "prop:pearl_necklace",
    ("necklace", "다이아 목걸이"): "prop:diamond_necklace",
    ("necklace", "포근한 목도리"): "prop:scarf",
    ("bottom", "튜튜 치마"): "prop:tutu",
    ("top", "빨간 망토"): "prop:cape",
    ("held", "마법 지팡이"): "prop:wand",
    ("held", "아이스크림"): "prop:icecream",
    ("held", "노란 우산"): "prop:umbrella",
    ("misc", "풍선"): "prop:balloon",
    ("bag", "백팩"): "prop:backpack",
    ("floor", "꽃밭 러그"): "prop:flower_rug",
    ("floor", "구름 방석"): "prop:cloud_cushion",
    ("effect", "반짝반짝 오라"): "fx:sparkle_gold",
    ("effect", "하트 뿅뿅"): "fx:sparkle_pink",
    ("background", "벚꽃 배경"): "env:sakura",
    ("background", "바다 배경"): "env:ocean",
    ("background", "밤하늘"): "env:night",
    ("background", "무지개"): "env:rainbow",
    ("background", "우주"): "env:space",
    ("background", "크리스마스"): "env:xmas",
}


# 카테고리 재분류 (부위 교체 그룹 정리): (기존 category, name) → 새 category
RECATEGORIZE: dict[tuple[str, str], str] = {
    ("accessory", "왕관"): "hat",  # 왕관은 정수리 부위 — 모자끼리 자동 교체되도록
}


def seed_shop() -> None:
    db = SessionLocal()
    try:
        # 0) 재분류 — shop_items와 옷장(user_inventory.category 비정규화)을 함께 옮긴다
        from app.models.shop import UserInventory

        for (old_cat, name), new_cat in RECATEGORIZE.items():
            item = db.scalar(
                select(ShopItem).where(ShopItem.category == old_cat, ShopItem.name == name)
            )
            if item is None:
                continue
            item.category = new_cat
            for inv in db.scalars(
                select(UserInventory).where(UserInventory.item_id == item.id)
            ).all():
                inv.category = new_cat
            print(f"recategorized: {name} {old_cat} -> {new_cat}")

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

        # 3D 참조·판매 여부 동기화 (매 실행마다 — 멱등)
        activated = 0
        deactivated = 0
        for item in db.scalars(select(ShopItem)).all():
            ref = ASSET_REFS.get((item.category, item.name))
            item.asset_ref = ref
            active = ref is not None
            if item.is_active != active:
                if active:
                    activated += 1
                else:
                    deactivated += 1
                item.is_active = active
        db.commit()
        print(
            f"shop seed: {created} created, {len(CATALOG) - created} skipped, "
            f"3D 활성 {activated}, 비활성 {deactivated}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    seed_shop()
