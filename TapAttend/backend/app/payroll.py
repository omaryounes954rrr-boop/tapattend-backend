from datetime import datetime, time, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, AttendanceLog

# إنشاء مسار جديد للـ API الخاص بالمرتبات
router = APIRouter(prefix="/api/payroll", tags=["Payroll"])

@router.get("/{user_id}")
def calculate_payroll(user_id: str, db: Session = Depends(get_db)):
    # 1. التأكد أن الموظف موجود
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # 2. جلب سجلات الحضور الخاصة به مرتبة زمنياً
    logs = (
        db.query(AttendanceLog)
        .filter(AttendanceLog.user_id == user_id)
        .order_by(AttendanceLog.recorded_at.asc())
        .all()
    )
    
    total_hours = 0.0
    deductions = 0.0
    last_in_time = None
    
    # تحديد موعد بداية الشفت الرسمي (مثلاً الساعة 9:00 صباحاً)
    official_start_hour = 9
    official_start_minute = 0
    daily_base_hours = 8 # عدد ساعات اليوم الواحد افتراضياً
    hourly_rate = user.hourly_rate or 50.0

    for log in logs:
        if log.event_type == "in":
            last_in_time = log.recorded_at
            
            # --- حساب خصم التأخير ---
            log_time = log.recorded_at.time()
            log_minutes = log_time.hour * 60 + log_time.minute
            shift_minutes = official_start_hour * 60 + official_start_minute
            delay_minutes = log_minutes - shift_minutes
            
            # قاعدة الخصومات اللي طلبتها:
            # لو التأخير أكبر من 15 دقيقة وحتى 60 دقيقة -> خصم ربع يوم
            # لو التأخير أكبر من 60 دقيقة -> خصم نصف يوم
            if delay_minutes > 60:
                deductions += (daily_base_hours / 2) * hourly_rate
            elif delay_minutes > 15:
                deductions += (daily_base_hours / 4) * hourly_rate

        elif log.event_type == "out" and last_in_time:
            # حساب ساعات العمل الفعلية للفترة دي
            duration = (log.recorded_at - last_in_time).total_seconds() / 3600.0
            total_hours += duration
            last_in_time = None

    # 3. حساب إجمالي المرتب والخصومات والصافي لقسم المالية
    gross_salary = total_hours * hourly_rate
    net_salary = gross_salary - deductions

    return {
        "employee_name": user.full_name,
        "email": user.email,
        "hourly_rate": hourly_rate,
        "total_hours_worked": round(total_hours, 2),
        "gross_salary": round(gross_salary, 2),
        "total_deductions": round(deductions, 2),
        "net_salary": round(max(0.0, net_salary), 2) # صافي المرتب النهائي
    }