from datetime import datetime, time, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, AttendanceLog

router = APIRouter(prefix="/api/payroll", tags=["payroll"])

@router.get("/{user_id}")
def calculate_payroll_v1(user_id: str, db: Session = Depends(get_db)):
    """Enhanced V1 payroll: hourly rate + simple late deductions."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    logs = (
        db.query(AttendanceLog)
        .filter(AttendanceLog.user_id == user_id)
        .order_by(AttendanceLog.recorded_at.asc())
        .all()
    )
    
    total_hours = 0.0
    deductions = 0.0
    hourly_rate = user.hourly_rate or 50.0
    DAILY_HOURS = 8
    
    for log in logs:
        if log.event_type == "in":
            # Simple late deduction rule: checked in after 9:15 AM = 10% daily deduction
            in_time = log.recorded_at.time()
            # Compare to 9:15 AM
            nine_fifteen = time(9, 15)
            if in_time > nine_fifteen:
                # Calculate proportion of day missed
                minutes_late = (in_time.hour * 60 + in_time.minute) - (9 * 60 + 15)
                if minutes_late >= 45:  # Late by 45+ min = full 10% deduction
                    deductions += (DAILY_HOURS * hourly_rate) * 0.10
                elif minutes_late >= 15:  # Late by 15-44 min = proportional
                    ded_pct = (minutes_late / 45) * 0.10
                    deductions += (DAILY_HOURS * hourly_rate) * ded_pct
        
        elif log.event_type == "out" and total_hours < DAILY_HOURS * 2:
            # Find the most recent "in" log for this employee
            prev_in = None
            for l in logs:
                if l.event_type == "in" and l.recorded_at < log.recorded_at:
                    if prev_in is None or l.recorded_at > prev_in.recorded_at:
                        prev_in = l
            
            if prev_in:
                duration = (log.recorded_at - prev_in.recorded_at).total_seconds() / 3600.0
                # Cap at max 12 hours per shift
                duration = min(duration, 12.0)
                total_hours += duration
    
    gross = total_hours * hourly_rate
    net = max(0.0, gross - deductions)
    
    return {
        "employee_name": user.full_name,
        "hourly_rate": round(hourly_rate, 2),
        "total_hours": round(total_hours, 2),
        "gross_salary": round(gross, 2),
        "deductions": round(deductions, 2),
        "net_salary": round(net, 2),
        "period": "Current month",
        "calculation_method": "Hourly + simple late deductions (>15min late = 10% daily)"
    }