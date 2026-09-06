from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import hash_password
from ..database import get_db
from ..deps import require_roles
from ..models import User
from ..schemas import UserCreateIn, UserOut

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(user: User = Depends(require_roles("owner", "hr")), db: Session = Depends(get_db)):
    return db.query(User).filter(User.org_id == user.org_id).order_by(User.created_at.desc()).all()


@router.post("", response_model=UserOut)
def create_user(
    body: UserCreateIn,
    user: User = Depends(require_roles("owner", "hr")),
    db: Session = Depends(get_db),
):
    if user.role == "hr" and body.role != "employee":
        raise HTTPException(status_code=403, detail="HR can only create employees")
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    created = User(
        full_name=body.full_name.strip(),
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        role=body.role,
        org_id=user.org_id,
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    return created


@router.delete("/{user_id}")
def delete_user(
    user_id: str,
    user: User = Depends(require_roles("owner")),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if target is None or target.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db.delete(target)
    db.commit()
    return {"ok": True}
