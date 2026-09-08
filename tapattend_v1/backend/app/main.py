import sys
from pathlib import Path

# Add the project root to path so we can import app modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import Base, engine
from app.models import AttendanceLog, CheckinPoint, Organization, User  # noqa: F401
from app.routers import attendance, auth, points, users, payroll_v1
from app.payroll import router as payroll_legacy_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="TapAttend V1", version="0.1.0")
origins = [item.strip() for item in settings.cors_origins.split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(points.router)
app.include_router(attendance.router)
app.include_router(payroll_v1)
app.include_router(payroll_legacy_router)

static_dir = Path(__file__).parent / "static"
app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")


@app.get("/api/health")
def health():
    return {"ok": True, "service": "TapAttend V1"}


@app.get("/")
def dashboard():
    return FileResponse(static_dir / "index.html")