import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_roles
from ..models import CheckinPoint, User
from ..schemas import PointCreateIn, PointOut, PointUpdateIn

router = APIRouter(prefix="/api/points", tags=["points"])


@router.get("", response_model=list[PointOut])
def list_points(user: User = Depends(require_roles("owner", "hr")), db: Session = Depends(get_db)):
    return db.query(CheckinPoint).filter(CheckinPoint.org_id == user.org_id).all()


@router.post("", response_model=PointOut)
def create_point(
    body: PointCreateIn,
    user: User = Depends(require_roles("owner", "hr")),
    db: Session = Depends(get_db),
):
    token = (body.token_uid or "").strip() or uuid.uuid4().hex
    exists = (
        db.query(CheckinPoint)
        .filter(CheckinPoint.org_id == user.org_id, CheckinPoint.token_uid == token)
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail="Token already used")
    point = CheckinPoint(
        token_uid=token,
        org_id=user.org_id,
        location_name=(body.location_name or "").strip() or None,
        latitude=body.latitude,
        longitude=body.longitude,
        radius_meters=body.radius_meters or 30,
    )
    db.add(point)
    db.commit()
    db.refresh(point)
    return point


@router.patch("/{point_id}", response_model=PointOut)
def update_point(
    point_id: str,
    body: PointUpdateIn,
    user: User = Depends(require_roles("owner", "hr")),
    db: Session = Depends(get_db),
):
    point = db.get(CheckinPoint, point_id)
    if point is None or point.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Point not found")
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(point, key, value)
    db.commit()
    db.refresh(point)
    return point
