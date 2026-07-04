"""관리자 TODO 관리 라우터. TECH_DESIGN §3 (POST/PATCH/DELETE /admin/todos).

관리자만 TODO를 입력/수정/삭제한다 (SPEC §6.2 권한 매트릭스). 포인트를 건드리지
않는 순수 CRUD이므로 라우터에서 처리한다. 포인트 지급/회수는 사용자 토글에서만 일어난다.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_admin
from app.models.todo import Todo
from app.models.user import User
from app.schemas.todo import AdminTodoCreate, AdminTodoUpdate, TodoOut

router = APIRouter(prefix="/admin/todos", tags=["admin-todos"])


@router.post("", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
def create_todo(
    body: AdminTodoCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Todo:
    """새 TODO 생성. 대상 사용자가 존재해야 한다 (FK로도 강제되지만 친절한 오류를 준다)."""
    owner = db.get(User, body.user_id)
    if owner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="대상 사용자를 찾을 수 없습니다",
        )

    # 같은 사용자·날짜의 맨 뒤에 추가되도록 sort_order를 max+1로 배정.
    max_order = db.scalar(
        select(func.max(Todo.sort_order)).where(
            Todo.user_id == body.user_id, Todo.due_date == body.due_date
        )
    )
    next_order = 0 if max_order is None else max_order + 1

    todo = Todo(
        user_id=body.user_id,
        due_date=body.due_date,
        content=body.content,
        sort_order=next_order,
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.patch("/{todo_id}", response_model=TodoOut)
def update_todo(
    todo_id: uuid.UUID,
    body: AdminTodoUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Todo:
    """TODO 내용/날짜 수정 (부분 갱신). is_done·포인트는 여기서 손대지 않는다."""
    todo = db.get(Todo, todo_id)
    if todo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TODO를 찾을 수 없습니다")

    if body.content is not None:
        todo.content = body.content
    if body.due_date is not None:
        todo.due_date = body.due_date
    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_todo(
    todo_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> None:
    """TODO 삭제."""
    todo = db.get(Todo, todo_id)
    if todo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TODO를 찾을 수 없습니다")
    db.delete(todo)
    db.commit()
