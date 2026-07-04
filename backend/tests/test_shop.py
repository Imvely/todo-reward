"""A상점 구매 시나리오 — TECH_DESIGN §6-5, §3.

핵심 불변: A상점 구매는 A포인트만 차감하고 B는 절대 건드리지 않는다.
잔액 부족이면 400 + 아무 변화 없음.
"""

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.core.security import hash_password
from app.models.points import PointTransaction
from app.models.shop import ShopItem, UserInventory
from app.models.user import User
from app.services.shop import purchase_item


def _mk_user(db, a=100, b=100, role="user"):
    u = User(username="t_shop", password_hash=hash_password("x"), role=role, point_a=a, point_b=b)
    db.add(u)
    db.flush()
    return u


def _mk_item(db, price=30, category="hair", name="멋진 머리", active=True):
    it = ShopItem(
        category=category,
        name=name,
        price=price,
        image_url="http://example/img.png",
        is_active=active,
    )
    db.add(it)
    db.flush()
    return it


def test_purchase_deducts_a_only(db_session):
    u = _mk_user(db_session, a=100, b=100)
    it = _mk_item(db_session, price=30, category="hair")

    res = purchase_item(db_session, u, it.id)

    assert u.point_a == 70  # A만 차감
    assert u.point_b == 100  # B 불변 (핵심)
    assert res.balances == {"point_a": 70, "point_b": 100}

    inv = db_session.scalar(select(UserInventory).where(UserInventory.user_id == u.id))
    assert inv is not None
    assert inv.item_id == it.id and inv.category == "hair" and inv.equipped is False

    # 원장: shop_purchase A -30 한 행만, B 행은 전혀 없음
    a_rows = db_session.scalars(
        select(PointTransaction).where(
            PointTransaction.user_id == u.id, PointTransaction.reason == "shop_purchase"
        )
    ).all()
    assert len(a_rows) == 1 and a_rows[0].kind == "A" and a_rows[0].amount == -30
    b_rows = db_session.scalars(
        select(PointTransaction).where(
            PointTransaction.user_id == u.id, PointTransaction.kind == "B"
        )
    ).all()
    assert b_rows == []


def test_purchase_insufficient_a_no_change(db_session):
    u = _mk_user(db_session, a=20, b=100)
    it = _mk_item(db_session, price=30)

    with pytest.raises(HTTPException) as exc:
        purchase_item(db_session, u, it.id)
    assert exc.value.status_code == 400

    # 아무 변화 없음
    assert u.point_a == 20 and u.point_b == 100
    assert db_session.scalar(select(UserInventory).where(UserInventory.user_id == u.id)) is None
    assert (
        db_session.scalars(select(PointTransaction).where(PointTransaction.user_id == u.id)).all()
        == []
    )


def test_purchase_twice_rejected(db_session):
    u = _mk_user(db_session, a=100)
    it = _mk_item(db_session, price=30)

    purchase_item(db_session, u, it.id)
    with pytest.raises(HTTPException) as exc:
        purchase_item(db_session, u, it.id)  # 이미 보유
    assert exc.value.status_code == 400
    assert u.point_a == 70  # 두 번째는 차감되지 않음


def test_purchase_admin_forbidden(db_session):
    u = _mk_user(db_session, a=100, role="admin")
    it = _mk_item(db_session, price=30)
    with pytest.raises(HTTPException) as exc:
        purchase_item(db_session, u, it.id)
    assert exc.value.status_code == 403


def test_purchase_missing_item_404(db_session):
    u = _mk_user(db_session, a=100)
    with pytest.raises(HTTPException) as exc:
        purchase_item(db_session, u, uuid.uuid4())
    assert exc.value.status_code == 404


def test_purchase_inactive_item_404(db_session):
    u = _mk_user(db_session, a=100)
    it = _mk_item(db_session, price=30, active=False)
    with pytest.raises(HTTPException) as exc:
        purchase_item(db_session, u, it.id)
    assert exc.value.status_code == 404
