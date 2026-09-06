# TapAttend

Attendance with NFC and QR: Flutter app, React dashboard, FastAPI, PostgreSQL.

## Local run (this machine)

Python is enough for the API and the built-in dashboard.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000

Default database is SQLite (`backend/tapattend.db`). For PostgreSQL set:

```
DATABASE_URL=postgresql+psycopg://tapattend:tapattend@localhost:5432/tapattend
```

Then apply `backend/sql/schema.sql` (or let SQLAlchemy create tables).

## React dashboard

```powershell
cd web
npm install
npm run dev
```

Vite proxies `/api` to port 8000.

## Flutter app

Install Flutter, then from `mobile/`:

```powershell
flutter create . --project-name tapattend
flutter pub get
flutter run
```

Point `TapAttendApi(baseUrl: ...)` at your machine IP if you run on a phone.

On Android, add camera, NFC, and location permissions in `AndroidManifest.xml`.
