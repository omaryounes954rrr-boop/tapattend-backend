CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  country TEXT DEFAULT 'EG',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','hr','employee')),
  org_id UUID NOT NULL REFERENCES organizations(id),
  device_fingerprint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE checkin_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_uid TEXT NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id),
  location_name TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  radius_meters INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE (org_id, token_uid)
);

CREATE TABLE attendance_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  point_id UUID NOT NULL REFERENCES checkin_points(id),
  org_id UUID NOT NULL REFERENCES organizations(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('in','out')),
  scan_method TEXT NOT NULL CHECK (scan_method IN ('nfc','qr')),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  device_id TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION
);

CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_points_org ON checkin_points(org_id);
CREATE INDEX idx_logs_org_time ON attendance_logs(org_id, recorded_at DESC);
CREATE INDEX idx_logs_user_time ON attendance_logs(user_id, recorded_at DESC);
