from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, engine
from .models import AttendanceLog, CheckinPoint, Organization, User  # noqa: F401
from .routers import attendance, auth, points, users
from app.payroll import router as payroll_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="TapAttend", version="0.1.0")
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
app.include_router(payroll_router)

static_dir = Path(__file__).parent / "static"
app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")


@app.get("/api/health")
def health():
    return {"ok": True, "service": "TapAttend"}


@app.get("/")
def dashboard():
    return FileResponse(static_dir / "index.html")