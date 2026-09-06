from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import create_token, hash_password, verify_password
from ..database import get_db
from ..deps import current_user
from ..models import Organization, User
from ..schemas import LoginIn, MeOut, OrgRegisterIn, TokenOut, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register-org", response_model=TokenOut)
def register_org(body: OrgRegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    org = Organization(name=body.org_name.strip(), country=body.country.strip() or "EG")
    db.add(org)
    db.flush()
    user = User(
        full_name=body.full_name.strip(),
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        role="owner",
        org_id=org.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_token(user.id, user.org_id, user.role))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return TokenOut(access_token=create_token(user.id, user.org_id, user.role))


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(current_user)):
    return MeOut(
        **UserOut.model_validate(user).model_dump(),
        org_name=user.organization.name,
        country=user.organization.country,
    )
