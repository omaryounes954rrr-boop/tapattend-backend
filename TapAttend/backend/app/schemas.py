from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class OrgRegisterIn(BaseModel):
    org_name: str = Field(min_length=2, max_length=200)
    country: str = "EG"
    full_name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    full_name: str
    email: str
    role: str
    org_id: str
    device_fingerprint: str | None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class MeOut(UserOut):
    org_name: str
    country: str


class UserCreateIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern="^(hr|employee)$")


class PointCreateIn(BaseModel):
    token_uid: str | None = None
    location_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    radius_meters: int = 30


class PointUpdateIn(BaseModel):
    location_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    radius_meters: int | None = None
    is_active: bool | None = None


class PointOut(BaseModel):
    id: str
    token_uid: str
    org_id: str
    location_name: str | None
    latitude: float | None
    longitude: float | None
    radius_meters: int
    is_active: bool

    model_config = {"from_attributes": True}


class ScanIn(BaseModel):
    token_uid: str
    scan_method: str = Field(pattern="^(nfc|qr)$")
    latitude: float | None = None
    longitude: float | None = None
    device_id: str | None = None


class DemoScanIn(BaseModel):
    email: EmailStr
    token_uid: str
    scan_method: str = Field(default="qr", pattern="^(nfc|qr)$")
    event_type: str | None = Field(default=None, pattern="^(in|out)$")


class AttendanceOut(BaseModel):
    id: str
    user_id: str
    point_id: str
    org_id: str
    event_type: str
    scan_method: str
    recorded_at: datetime
    device_id: str | None
    latitude: float | None
    longitude: float | None
    user_name: str | None = None
    location_name: str | None = None

    model_config = {"from_attributes": True}


class ScanOut(BaseModel):
    log: AttendanceOut
    message: str
