"""Insert a demo attendance row into SQLite/Postgres.

Run from the backend folder:

  python demo_checkin.py
  python demo_checkin.py employee@company.com POINT_TOKEN
  python demo_checkin.py employee@company.com POINT_TOKEN in
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone

from app.database import SessionLocal
from app.models import AttendanceLog, CheckinPoint, User


def main() -> None:
    db = SessionLocal()
    try:
        users = db.query(User).order_by(User.created_at.desc()).all()
        points = db.query(CheckinPoint).all()
        if len(sys.argv) < 3:
            print("Users:")
            for user in users:
                line = f"  {user.email} | {user.role} | {user.full_name}"
                print(line.encode("ascii", "replace").decode())
            print("\nCheck-in points:")
            for point in points:
                loc = point.location_name or "-"
                line = f"  {point.token_uid} | {loc}"
                print(line.encode("ascii", "replace").decode())
            print("\nUsage: python demo_checkin.py EMAIL TOKEN [in|out]")
            return

        email = sys.argv[1].strip().lower()
        token = sys.argv[2].strip()
        forced = sys.argv[3].strip() if len(sys.argv) > 3 else None

        user = db.query(User).filter(User.email == email).first()
        if user is None:
            raise SystemExit(f"No user with email {email}")
        point = (
            db.query(CheckinPoint)
            .filter(CheckinPoint.org_id == user.org_id, CheckinPoint.token_uid == token)
            .first()
        )
        if point is None:
            raise SystemExit(f"No check-in point with token {token} in this org")

        last = (
            db.query(AttendanceLog)
            .filter(AttendanceLog.user_id == user.id)
            .order_by(AttendanceLog.recorded_at.desc())
            .first()
        )
        event_type = forced if forced in {"in", "out"} else ("out" if last and last.event_type == "in" else "in")
        log = AttendanceLog(
            user_id=user.id,
            point_id=point.id,
            org_id=user.org_id,
            event_type=event_type,
            scan_method="qr",
            recorded_at=datetime.now(timezone.utc),
            device_id="demo-script",
        )
        db.add(log)
        db.commit()
        print(f"OK  {event_type}  {user.email}  @ {point.token_uid}  id={log.id}".encode("ascii", "replace").decode())
    finally:
        db.close()


if __name__ == "__main__":
    main()
