from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..config import settings
from ..database import get_db
from ..deps import current_user, require_roles
from ..geo import within_radius
from ..models import AttendanceLog, CheckinPoint, User
from ..schemas import AttendanceOut, DemoScanIn, ScanIn, ScanOut

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


def to_out(log: AttendanceLog) -> AttendanceOut:
    return AttendanceOut(
        id=log.id,
        user_id=log.user_id,
        point_id=log.point_id,
        org_id=log.org_id,
        event_type=log.event_type,
        scan_method=log.scan_method,
        recorded_at=log.recorded_at,
        device_id=log.device_id,
        latitude=log.latitude,
        longitude=log.longitude,
        user_name=log.user.full_name if log.user else None,
        location_name=log.point.location_name if log.point else None,
    )


@router.post("/scan", response_model=ScanOut)
def scan(body: ScanIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    point = (
        db.query(CheckinPoint)
        .filter(
            CheckinPoint.org_id == user.org_id,
            CheckinPoint.token_uid == body.token_uid.strip(),
            CheckinPoint.is_active.is_(True),
        )
        .first()
    )
    if point is None:
        raise HTTPException(status_code=404, detail="Check-in point not found")

    if point.latitude is not None and point.longitude is not None:
        if not within_radius(point.latitude, point.longitude, body.latitude, body.longitude, point.radius_meters):
            raise HTTPException(status_code=403, detail="Outside allowed location radius")

    if user.device_fingerprint:
        if not body.device_id or body.device_id != user.device_fingerprint:
            raise HTTPException(status_code=403, detail="This account is bound to another device")
    elif body.device_id:
        user.device_fingerprint = body.device_id

    last = (
        db.query(AttendanceLog)
        .filter(AttendanceLog.user_id == user.id)
        .order_by(AttendanceLog.recorded_at.desc())
        .first()
    )
    now = datetime.now(timezone.utc)
    if last and last.recorded_at:
        last_at = last.recorded_at
        if last_at.tzinfo is None:
            last_at = last_at.replace(tzinfo=timezone.utc)
        if now - last_at < timedelta(seconds=settings.duplicate_scan_seconds):
            raise HTTPException(status_code=429, detail="Duplicate scan — wait a moment")

    event_type = "out" if last and last.event_type == "in" else "in"
    log = AttendanceLog(
        user_id=user.id,
        point_id=point.id,
        org_id=user.org_id,
        event_type=event_type,
        scan_method=body.scan_method,
        recorded_at=now,
        device_id=body.device_id,
        latitude=body.latitude,
        longitude=body.longitude,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    log.user = user
    log.point = point
    verb = "حضور" if event_type == "in" else "انصراف"
    return ScanOut(log=to_out(log), message=f"تم تسجيل {verb} بنجاح")


def _next_event(db: Session, user_id: str) -> str:
    last = (
        db.query(AttendanceLog)
        .filter(AttendanceLog.user_id == user_id)
        .order_by(AttendanceLog.recorded_at.desc())
        .first()
    )
    return "out" if last and last.event_type == "in" else "in"


@router.post("/demo-scan", response_model=ScanOut)
def demo_scan(
    body: DemoScanIn,
    admin: User = Depends(require_roles("owner", "hr")),
    db: Session = Depends(get_db),
):
    """Owner/HR test helper: write a check-in/out without GPS or device checks."""
    employee = (
        db.query(User)
        .filter(User.org_id == admin.org_id, User.email == str(body.email).lower())
        .first()
    )
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found in this organization")
    point = (
        db.query(CheckinPoint)
        .filter(
            CheckinPoint.org_id == admin.org_id,
            CheckinPoint.token_uid == body.token_uid.strip(),
            CheckinPoint.is_active.is_(True),
        )
        .first()
    )
    if point is None:
        raise HTTPException(status_code=404, detail="Check-in point not found")
    event_type = body.event_type or _next_event(db, employee.id)
    log = AttendanceLog(
        user_id=employee.id,
        point_id=point.id,
        org_id=admin.org_id,
        event_type=event_type,
        scan_method=body.scan_method,
        recorded_at=datetime.now(timezone.utc),
        device_id="demo-script",
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    log.user = employee
    log.point = point
    verb = "حضور" if event_type == "in" else "انصراف"
    return ScanOut(log=to_out(log), message=f"تجريبي: تم تسجيل {verb} لـ {employee.full_name}")


@router.get("/logs", response_model=list[AttendanceOut])
def logs(
    user: User = Depends(require_roles("owner", "hr")),
    db: Session = Depends(get_db),
    limit: int = Query(200, le=500),
):
    rows = (
        db.query(AttendanceLog)
        .options(joinedload(AttendanceLog.user), joinedload(AttendanceLog.point))
        .filter(AttendanceLog.org_id == user.org_id)
        .order_by(AttendanceLog.recorded_at.desc())
        .limit(limit)
        .all()
    )
    return [to_out(row) for row in rows]


@router.get("/mine", response_model=list[AttendanceOut])
def mine(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(AttendanceLog)
        .options(joinedload(AttendanceLog.user), joinedload(AttendanceLog.point))
        .filter(AttendanceLog.user_id == user.id)
        .order_by(AttendanceLog.recorded_at.desc())
        .limit(100)
        .all()
    )
    return [to_out(row) for row in rows]


@router.get("/today-summary")
def today_summary(user: User = Depends(require_roles("owner", "hr")), db: Session = Depends(get_db)):
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (
        db.query(AttendanceLog)
        .filter(AttendanceLog.org_id == user.org_id, AttendanceLog.recorded_at >= start)
        .all()
    )
    present = {row.user_id for row in rows if row.event_type == "in"}
    employees = db.query(User).filter(User.org_id == user.org_id, User.role == "employee").count()
    return {
        "scans_today": len(rows),
        "present_employees": len(present),
        "total_employees": employees,
    }