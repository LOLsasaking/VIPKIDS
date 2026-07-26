"""VIP KIDS TRANSPORTATION — FastAPI backend.
Premium school chauffeur app with JWT auth (parent/driver/admin), live GPS, chat,
check-in/out events, schedule requests, announcements.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import List, Optional, Literal
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import asyncio
import json
import jwt
from jwt import InvalidTokenError
import bcrypt
import os
import uuid
import logging
import hashlib
import urllib.request
import urllib.error

ROOT = Path(__file__).parent

def load_local_env(path: Path):
    """Load simple KEY=VALUE development settings without interpolation or execution."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key.replace("_", "").isalnum():
            os.environ.setdefault(key, value.strip())

load_local_env(ROOT / ".env")

# ---------- Config ----------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"
JWT_TTL_HOURS = int(os.environ.get("JWT_TTL_HOURS", "12"))
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").strip().lower()
GPS_RETENTION_DAYS = int(os.environ.get("GPS_RETENTION_DAYS", "30"))
EXPO_PUSH_URL = os.environ.get("EXPO_PUSH_URL", "https://exp.host/--/api/v2/push/send")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "gonxander@gmail.com").strip().lower()
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "ALLOWED_ORIGINS",
        "http://localhost:8081,http://127.0.0.1:8081",
    ).split(",")
    if origin.strip()
]

if ENVIRONMENT == "production":
    config_errors = []
    if len(JWT_SECRET) < 32:
        config_errors.append("JWT_SECRET must contain at least 32 characters")
    if len(ADMIN_PASSWORD) < 12:
        config_errors.append("ADMIN_PASSWORD must contain at least 12 characters")
    if not MONGO_URL.startswith(("mongodb+srv://", "mongodb://")):
        config_errors.append("MONGO_URL must use a MongoDB connection string")
    if any(origin.startswith("http://") or "localhost" in origin or "127.0.0.1" in origin for origin in ALLOWED_ORIGINS):
        config_errors.append("ALLOWED_ORIGINS must contain only production HTTPS origins")
    if config_errors:
        raise RuntimeError("Invalid production configuration: " + "; ".join(config_errors))

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="VIP KIDS TRANSPORTATION API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("vipkids")

# ---------- Helpers ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def fresh_location(location: Optional[dict], max_age_seconds: int = 20) -> Optional[dict]:
    if not location:
        return None
    try:
        updated_at = datetime.fromisoformat(location["updated_at"])
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        if (now_utc() - updated_at).total_seconds() > max_age_seconds:
            return None
    except (KeyError, TypeError, ValueError):
        return None
    return location

def new_id() -> str:
    return str(uuid.uuid4())

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "iat": now_utc(),
        "exp": now_utc() + timedelta(hours=JWT_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except InvalidTokenError:
        return None

async def enforce_rate_limit(bucket: str, subject: str, limit: int, window_seconds: int):
    now = now_utc()
    key = hashlib.sha256(f"{bucket}:{subject}".encode()).hexdigest()
    record = await db.auth_rate_limits.find_one({"id": key})
    expires_at = record.get("expires_at") if record else None
    if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if record and isinstance(expires_at, datetime) and expires_at > now:
        if record.get("count", 0) >= limit:
            raise HTTPException(429, "Too many attempts. Please try again later.")
        await db.auth_rate_limits.update_one({"id": key}, {"$inc": {"count": 1}})
        return key
    await db.auth_rate_limits.replace_one(
        {"id": key},
        {"id": key, "count": 1, "expires_at": now + timedelta(seconds=window_seconds)},
        upsert=True,
    )
    return key

def demo_accounts_enabled() -> bool:
    """Demo/reviewer accounts: on by default outside production, explicit opt-in in production.

    App-store reviewers need permanent working credentials against the live backend, so
    production allows them only when ENABLE_DEMO_ACCOUNTS is set deliberately.
    """
    default = "false" if ENVIRONMENT == "production" else "true"
    return os.environ.get("ENABLE_DEMO_ACCOUNTS", default).strip().lower() in ("1", "true", "yes")

async def refresh_development_demo_locations():
    """Keep demo vehicles visible while testers (and store reviewers) click around the app."""
    if not demo_accounts_enabled():
        return
    now = now_utc()
    await db.driver_locations.update_many(
        {"id": {"$regex": "^demo-location-"}},
        {"$set": {
            "updated_at": now.isoformat(),
            "expires_at": now + timedelta(minutes=30),
        }},
    )

bearer = HTTPBearer(auto_error=False)

async def current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(401, "Not authenticated")
    payload = decode_token(creds.credentials)
    if not payload:
        raise HTTPException(401, "Invalid or expired token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    if user.get("status") in ("pending", "suspended"):
        raise HTTPException(403, "Account is not active")
    return user

def require_role(*roles: str):
    async def checker(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return user
    return checker

def public_contact_user(user: Optional[dict]) -> Optional[dict]:
    """Return only fields needed by an assigned family/driver contact."""
    if not user:
        return None
    allowed = ("id", "name", "role", "phone", "photo_url", "license_number")
    return {key: user.get(key) for key in allowed if user.get(key) is not None}

def restricted_child_view(child: dict) -> dict:
    """Return only the child's own ride details needed in the restricted child app."""
    allowed = (
        "id", "name", "school", "pickup_time", "dropoff_time", "grade", "round_trip",
        "emergency_contact_name", "emergency_contact_phone",
    )
    return {key: child.get(key) for key in allowed if child.get(key) is not None}

def notification_pref_key(notification_type: Optional[str]) -> Optional[str]:
    if notification_type == "announcement":
        return "announcements"
    return notification_type

def is_expo_push_token(token: str) -> bool:
    return token.startswith("ExpoPushToken[") or token.startswith("ExponentPushToken[")

async def send_push_notifications(notifications: List[dict]) -> None:
    """Best-effort OS push fan-out for notifications already persisted in-app."""
    if not notifications:
        return
    user_ids = sorted({n.get("user_id") for n in notifications if n.get("user_id")})
    if not user_ids:
        return
    users = {
        u["id"]: u
        for u in await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "notif_prefs": 1}).to_list(1000)
    }
    push_tokens = await db.push_tokens.find(
        {"user_id": {"$in": user_ids}, "disabled": {"$ne": True}},
        {"_id": 0},
    ).to_list(2000)
    tokens_by_user: dict[str, list[str]] = {}
    for token_doc in push_tokens:
        token = token_doc.get("token", "")
        if is_expo_push_token(token):
            tokens_by_user.setdefault(token_doc["user_id"], []).append(token)

    messages = []
    for notif in notifications:
        recipient = users.get(notif.get("user_id"))
        prefs = (recipient or {}).get("notif_prefs") or {}
        pref_key = notification_pref_key(notif.get("type"))
        if prefs.get("mute_all") or (pref_key and prefs.get(pref_key) is False):
            continue
        for token in tokens_by_user.get(notif.get("user_id"), []):
            messages.append({
                "to": token,
                "title": str(notif.get("title") or "VIP Kids Transportation")[:120],
                "body": str(notif.get("body") or "")[:240],
                "sound": "default",
                "priority": "high",
                "channelId": "vipkids-safety",
                "data": {
                    "id": notif.get("id"),
                    "type": notif.get("type"),
                    "user_id": notif.get("user_id"),
                },
            })
    if not messages:
        return

    def post_chunk(chunk: list[dict]) -> dict:
        payload = json.dumps(chunk).encode("utf-8")
        request = urllib.request.Request(
            EXPO_PUSH_URL,
            data=payload,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Accept-Encoding": "gzip, deflate",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=12) as response:
            return json.loads(response.read().decode("utf-8"))

    for start in range(0, len(messages), 100):
        chunk = messages[start:start + 100]
        try:
            result = await asyncio.to_thread(post_chunk, chunk)
            tickets = result.get("data", []) if isinstance(result, dict) else []
            stale_tokens = [
                chunk[index]["to"]
                for index, ticket in enumerate(tickets)
                if isinstance(ticket, dict)
                and ticket.get("status") == "error"
                and (ticket.get("details") or {}).get("error") == "DeviceNotRegistered"
            ]
            if stale_tokens:
                await db.push_tokens.update_many({"token": {"$in": stale_tokens}}, {"$set": {"disabled": True}})
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            log.warning("Expo push send failed: %s", exc)

async def persist_notifications(notifications: List[dict]) -> None:
    if notifications:
        await db.notifications.insert_many(notifications)
        await send_push_notifications(notifications)

async def persist_notification(notification: dict) -> None:
    await db.notifications.insert_one(notification)
    await send_push_notifications([notification])

# ---------- Models ----------
class AccessRequestIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=2, max_length=100)
    role: Literal["parent", "driver"]
    phone: Optional[str] = Field(default=None, max_length=30)
    address: Optional[str] = Field(default=None, max_length=300)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class DeleteAccountIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    confirmation: Literal["DELETE"]

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class ChildIn(BaseModel):
    name: str
    parent_id: str
    driver_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    school: str
    pickup_time: str  # "07:30"
    dropoff_time: str  # "15:30"
    home_address: str
    school_address: str
    birth_date: Optional[str] = None  # YYYY-MM-DD
    grade: Optional[str] = None
    round_trip: bool = True  # Ida y Vuelta
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    contact_phone: Optional[str] = None  # child's own contact if applicable

class ParentChildIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    child_email: EmailStr
    child_password: str = Field(min_length=8, max_length=128)
    school: str = Field(min_length=2, max_length=160)
    pickup_time: str = Field(min_length=3, max_length=20)
    dropoff_time: str = Field(min_length=3, max_length=20)
    home_address: str = Field(min_length=4, max_length=300)
    school_address: str = Field(min_length=4, max_length=300)
    birth_date: Optional[str] = Field(default=None, max_length=20)
    grade: Optional[str] = Field(default=None, max_length=40)
    round_trip: bool = True
    emergency_contact_name: Optional[str] = Field(default=None, max_length=100)
    emergency_contact_phone: Optional[str] = Field(default=None, max_length=30)
    contact_phone: Optional[str] = Field(default=None, max_length=30)

class ChildAccessIn(BaseModel):
    email: EmailStr
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    enabled: bool = True
    guardian_consent_confirmed: bool

class VehicleIn(BaseModel):
    make: str
    model: str
    plate: str
    color: str
    year: Optional[int] = None
    photo_url: Optional[str] = None
    driver_id: Optional[str] = None
    registration_date: Optional[str] = None  # YYYY-MM-DD
    registration_expiry: Optional[str] = None  # YYYY-MM-DD
    insurance_expiry: Optional[str] = None
    inspection_expiry: Optional[str] = None

class RouteIn(BaseModel):
    name: str
    school: Optional[str] = None
    driver_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    child_ids: List[str] = []
    notes: Optional[str] = None

class CheckEventIn(BaseModel):
    child_id: str
    event_type: Literal["on_the_way", "approaching", "picked_up", "arrived_school", "leaving_school", "arriving_home", "arrived_home", "delay", "no_show", "alt_dropoff"]
    message: Optional[str] = None
    address: Optional[str] = None  # for alt_dropoff

class LocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)

class RouteStartIn(BaseModel):
    phase: Literal["morning", "afternoon"] = "morning"
    seatbelts_checked: bool = False
    fuel_level_checked: bool = False
    phone_charged_and_mounted: bool = False

class RoutePointIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)

class RoutePlanIn(BaseModel):
    phase: Literal["morning", "afternoon"]
    addresses: List[str] = Field(default_factory=list, max_length=50)
    points: List[RoutePointIn] = Field(min_length=2, max_length=1000)

class EmergencyIn(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    message: Optional[str] = None

class RouteEndIn(BaseModel):
    all_children_accounted_for: bool = False
    vehicle_checked_empty: bool = False

class MessageIn(BaseModel):
    to_user_id: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=2000)
    child_id: Optional[str] = Field(default=None, max_length=100)

class PushTokenIn(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    platform: Literal["android", "ios", "web", "unknown"] = "unknown"

class ScheduleRequestIn(BaseModel):
    child_id: str
    request_type: Literal["after_school_activity", "medical_appointment", "temporary_change"]
    when: str
    pickup_address: Optional[str] = None
    dropoff_address: Optional[str] = None
    notes: Optional[str] = None

class AnnouncementIn(BaseModel):
    title: str
    body: str
    category: Literal["weather", "school_closing", "emergency", "general"] = "general"

class NotifPrefsIn(BaseModel):
    on_the_way: bool = True
    approaching: bool = True
    picked_up: bool = True
    arrived_school: bool = True
    leaving_school: bool = True
    arriving_home: bool = True
    arrived_home: bool = True
    delay: bool = True
    no_show: bool = True
    announcements: bool = True
    mute_all: bool = False

async def delete_service_account(user: dict) -> None:
    """Delete a parent/driver account, or a child's login credentials."""
    user_id = user["id"]
    role = user.get("role")
    if role not in ("parent", "driver", "child"):
        raise HTTPException(400, "Administrator accounts cannot be deleted here")
    if role == "driver" and user.get("on_duty"):
        raise HTTPException(409, "End the active route before deleting this account")

    await db.messages.delete_many({"$or": [{"from_user_id": user_id}, {"to_user_id": user_id}]})
    await db.notifications.delete_many({"user_id": user_id})
    await db.push_tokens.delete_many({"user_id": user_id})

    if role == "parent":
        children = await db.children.find({"parent_id": user_id}, {"_id": 0, "id": 1}).to_list(100)
        child_ids = [child["id"] for child in children]
        if child_ids:
            await db.users.delete_many({"role": "child", "child_id": {"$in": child_ids}})
            await db.events.delete_many({"child_id": {"$in": child_ids}})
            await db.activity_events.delete_many({"child_id": {"$in": child_ids}})
            await db.messages.delete_many({"child_id": {"$in": child_ids}})
            await db.schedule_requests.delete_many({"child_id": {"$in": child_ids}})
            await db.routes.update_many({}, {"$pull": {"child_ids": {"$in": child_ids}}})
            await db.children.delete_many({"id": {"$in": child_ids}})
        await db.schedule_requests.delete_many({"parent_id": user_id})
    elif role == "driver":
        await db.children.update_many({"driver_id": user_id}, {"$unset": {"driver_id": ""}})
        await db.routes.update_many({"driver_id": user_id}, {"$unset": {"driver_id": ""}})
        await db.vehicles.update_many({"driver_id": user_id}, {"$unset": {"driver_id": ""}})
        await db.events.delete_many({"driver_id": user_id})
        await db.activity_events.delete_many({"driver_id": user_id})
        await db.driver_locations.delete_many({"driver_id": user_id})
        await db.driver_route_points.delete_many({"driver_id": user_id})
        await db.driver_route_plans.delete_many({"driver_id": user_id})

    await db.users.delete_one({"id": user_id})

async def upsert_child_access(
    child_id: str,
    email: str,
    password: Optional[str],
    enabled: bool,
    confirmed_by: str,
) -> dict:
    """Create or update the restricted login tied to one child record."""
    child = await db.children.find_one({"id": child_id}, {"_id": 0})
    if not child:
        raise HTTPException(404, "Child not found")
    normalized_email = email.lower()
    duplicate = await db.users.find_one({"email": normalized_email})
    if duplicate and duplicate.get("child_id") != child_id:
        raise HTTPException(409, "That email is already used by another account")
    existing = await db.users.find_one({"role": "child", "child_id": child_id})
    if not existing and not password:
        raise HTTPException(400, "A password is required when creating child access")
    update = {
        "email": normalized_email,
        "name": child["name"],
        "role": "child",
        "child_id": child_id,
        "status": "active" if enabled else "suspended",
        "updated_at": now_utc().isoformat(),
    }
    if password:
        update["password_hash"] = hash_pw(password)
    if not existing or not existing.get("guardian_consent_confirmed_at"):
        update["guardian_consent_confirmed_at"] = now_utc().isoformat()
        update["guardian_consent_confirmed_by"] = confirmed_by
    if existing:
        await db.users.update_one({"id": existing["id"]}, {"$set": update})
        account_id = existing["id"]
    else:
        account_id = new_id()
        await db.users.insert_one({
            "id": account_id,
            "created_at": now_utc().isoformat(),
            "notif_prefs": NotifPrefsIn().model_dump(),
            **update,
        })
    return {"id": account_id, "email": normalized_email, "status": update["status"]}

# ---------- Auth ----------
@api.post("/auth/register", status_code=status.HTTP_201_CREATED)
async def request_access(data: AccessRequestIn, request: Request):
    """Create a parent or driver request that must be approved by an admin."""
    email = data.email.lower()
    client_ip = request.client.host if request.client else "unknown"
    await enforce_rate_limit("register", client_ip, limit=5, window_seconds=3600)
    if await db.users.find_one({"email": email}):
        return {
            "ok": True,
            "status": "pending",
            "message": "If this email is eligible, its access request is awaiting administrator review.",
        }
    doc = {
        "id": new_id(),
        "email": email,
        "password_hash": hash_pw(data.password),
        "name": data.name.strip(),
        "role": data.role,
        "phone": data.phone.strip() if data.phone else None,
        "address": data.address.strip() if data.address and data.role == "parent" else None,
        "status": "pending",
        "created_at": now_utc().isoformat(),
        "notif_prefs": NotifPrefsIn().model_dump(),
    }
    await db.users.insert_one(doc)
    return {
        "ok": True,
        "status": "pending",
        "message": "Access request submitted for administrator approval.",
    }

@api.post("/auth/login", response_model=TokenOut)
async def login(data: LoginIn, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    limit_key = await enforce_rate_limit("login", f"{client_ip}:{data.email.lower()}", limit=8, window_seconds=900)
    u = await db.users.find_one({"email": data.email.lower()})
    if not u or not verify_pw(data.password, u["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    if u.get("status") == "pending":
        raise HTTPException(403, "Account pending admin approval")
    if u.get("status") == "suspended":
        raise HTTPException(403, "Account suspended. Contact your administrator.")
    await db.auth_rate_limits.delete_one({"id": limit_key})
    public = {k: v for k, v in u.items() if k not in ("password_hash", "_id")}
    return TokenOut(access_token=make_token(u["id"], u["role"]), user=public)

@api.post("/auth/delete-account")
async def delete_account(data: DeleteAccountIn, request: Request):
    """Self-service deletion for parent, driver, and child login accounts."""
    email = data.email.lower()
    client_ip = request.client.host if request.client else "unknown"
    await enforce_rate_limit("delete-account", f"{client_ip}:{email}", limit=5, window_seconds=3600)
    user = await db.users.find_one({"email": email})
    if not user or not verify_pw(data.password, user.get("password_hash", "")) or user.get("role") == "admin":
        raise HTTPException(401, "Invalid email or password")
    await delete_service_account(user)
    return {"ok": True, "message": "Account and associated personal data deleted"}

@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return user

@api.post("/push/register")
async def register_push_token(data: PushTokenIn, user: dict = Depends(current_user)):
    if not is_expo_push_token(data.token):
        raise HTTPException(400, "Unsupported push token")
    now = now_utc().isoformat()
    await db.push_tokens.update_one(
        {"user_id": user["id"], "token": data.token},
        {"$set": {
            "user_id": user["id"],
            "token": data.token,
            "platform": data.platform,
            "disabled": False,
            "updated_at": now,
        }, "$setOnInsert": {"id": new_id(), "created_at": now}},
        upsert=True,
    )
    return {"ok": True}

@api.post("/push/unregister")
async def unregister_push_token(data: PushTokenIn, user: dict = Depends(current_user)):
    await db.push_tokens.update_one(
        {"user_id": user["id"], "token": data.token},
        {"$set": {"disabled": True, "updated_at": now_utc().isoformat()}},
    )
    return {"ok": True}

class PhotoIn(BaseModel):
    photo_url: str = Field(min_length=1, max_length=2_000_000)

    @field_validator("photo_url")
    @classmethod
    def validate_photo_source(cls, value: str) -> str:
        allowed_data = ("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,")
        if value.startswith(allowed_data) or value.startswith("https://"):
            return value
        raise ValueError("Profile photos must be an HTTPS URL or supported image upload")

@api.put("/auth/photo")
async def update_photo(data: PhotoIn, user: dict = Depends(current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"photo_url": data.photo_url}})
    return {"ok": True, "photo_url": data.photo_url}

class AssignIn(BaseModel):
    driver_id: Optional[str] = None
    vehicle_id: Optional[str] = None

@api.put("/admin/children/{cid}/assign")
async def admin_assign(cid: str, data: AssignIn, user: dict = Depends(require_role("admin"))):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    await db.children.update_one({"id": cid}, {"$set": update})
    c = await db.children.find_one({"id": cid}, {"_id": 0})
    return c

@api.get("/admin/pending-users")
async def admin_pending(user: dict = Depends(require_role("admin"))):
    return await db.users.find({"status": "pending"}, {"_id": 0, "password_hash": 0}).to_list(200)

@api.post("/admin/approve/{uid}")
async def admin_approve(uid: str, user: dict = Depends(require_role("admin"))):
    u = await db.users.find_one({"id": uid})
    if not u:
        raise HTTPException(404, "User not found")
    new_status = "approved" if u.get("role") == "parent" else "active"
    await db.users.update_one({"id": uid}, {"$set": {"status": new_status}})
    return {"ok": True, "status": new_status}

@api.post("/admin/activate-parent/{uid}")
async def admin_activate_parent(uid: str, user: dict = Depends(require_role("admin"))):
    """Activate a parent once at least one child has driver+vehicle assigned."""
    kids = await db.children.find({"parent_id": uid}).to_list(50)
    if not kids:
        raise HTTPException(400, "Parent has no children yet — add a child first")
    ready = any(k.get("driver_id") and k.get("vehicle_id") for k in kids)
    if not ready:
        raise HTTPException(400, "Assign a driver and vehicle to at least one child first")
    await db.users.update_one({"id": uid}, {"$set": {"status": "active"}})
    return {"ok": True, "status": "active"}

@api.post("/admin/reject/{uid}")
async def admin_reject(uid: str, user: dict = Depends(require_role("admin"))):
    await db.users.delete_one({"id": uid})
    return {"ok": True}

@api.post("/admin/users/{uid}/suspend")
async def admin_suspend(uid: str, user: dict = Depends(require_role("admin"))):
    await db.users.update_one({"id": uid}, {"$set": {"status": "suspended"}})
    return {"ok": True, "status": "suspended"}

@api.post("/admin/users/{uid}/reactivate")
async def admin_reactivate(uid: str, user: dict = Depends(require_role("admin"))):
    u = await db.users.find_one({"id": uid})
    if not u:
        raise HTTPException(404, "User not found")
    new_status = "active" if u.get("role") in ("driver", "child", "admin") else "approved"
    await db.users.update_one({"id": uid}, {"$set": {"status": new_status}})
    return {"ok": True, "status": new_status}

class DriverComplianceIn(BaseModel):
    license_number: Optional[str] = None
    license_expiry: Optional[str] = None
    permit_expiry: Optional[str] = None

@api.put("/admin/users/{uid}")
async def admin_update_user(uid: str, data: dict, user: dict = Depends(require_role("admin"))):
    """Update user profile fields (name/phone/email/address/photo_url)."""
    allowed = {k: v for k, v in data.items() if k in ("name", "phone", "email", "address", "photo_url")}
    if "email" in allowed:
        allowed["email"] = allowed["email"].lower()
    if allowed:
        await db.users.update_one({"id": uid}, {"$set": allowed})
    u = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    return u

@api.put("/admin/vehicles/{vid}")
async def admin_update_vehicle(vid: str, data: VehicleIn, user: dict = Depends(require_role("admin"))):
    await db.vehicles.update_one({"id": vid}, {"$set": data.model_dump()})
    v = await db.vehicles.find_one({"id": vid}, {"_id": 0})
    return v

@api.delete("/admin/vehicles/{vid}")
async def admin_delete_vehicle(vid: str, user: dict = Depends(require_role("admin"))):
    await db.vehicles.delete_one({"id": vid})
    return {"ok": True}

# ---------- Routes ----------
@api.get("/admin/routes")
async def admin_list_routes(user: dict = Depends(require_role("admin"))):
    routes = await db.routes.find({}, {"_id": 0}).to_list(200)
    for r in routes:
        if r.get("driver_id"):
            r["driver"] = await db.users.find_one({"id": r["driver_id"]}, {"_id": 0, "password_hash": 0})
        if r.get("vehicle_id"):
            r["vehicle"] = await db.vehicles.find_one({"id": r["vehicle_id"]}, {"_id": 0})
        r["children"] = await db.children.find({"id": {"$in": r.get("child_ids", [])}}, {"_id": 0}).to_list(50)
    return routes

@api.post("/admin/routes")
async def admin_create_route(data: RouteIn, user: dict = Depends(require_role("admin"))):
    doc = {"id": new_id(), **data.model_dump(), "created_at": now_utc().isoformat()}
    await db.routes.insert_one(doc)
    # Side-effect: assign driver+vehicle to listed children for consistency
    if doc.get("driver_id") or doc.get("vehicle_id"):
        upd = {}
        if doc.get("driver_id"): upd["driver_id"] = doc["driver_id"]
        if doc.get("vehicle_id"): upd["vehicle_id"] = doc["vehicle_id"]
        if upd and doc.get("child_ids"):
            await db.children.update_many({"id": {"$in": doc["child_ids"]}}, {"$set": upd})
    doc.pop("_id", None)
    return doc

@api.put("/admin/routes/{rid}")
async def admin_update_route(rid: str, data: RouteIn, user: dict = Depends(require_role("admin"))):
    await db.routes.update_one({"id": rid}, {"$set": data.model_dump()})
    if data.driver_id or data.vehicle_id:
        upd = {}
        if data.driver_id: upd["driver_id"] = data.driver_id
        if data.vehicle_id: upd["vehicle_id"] = data.vehicle_id
        if upd and data.child_ids:
            await db.children.update_many({"id": {"$in": data.child_ids}}, {"$set": upd})
    r = await db.routes.find_one({"id": rid}, {"_id": 0})
    return r

@api.delete("/admin/routes/{rid}")
async def admin_delete_route(rid: str, user: dict = Depends(require_role("admin"))):
    await db.routes.delete_one({"id": rid})
    return {"ok": True}

# ---------- Operations (today's attendance) ----------
@api.get("/admin/operations/today")
async def admin_operations_today(user: dict = Depends(require_role("admin"))):
    today = now_utc().date().isoformat()
    children = await db.children.find({}, {"_id": 0}).to_list(500)
    out = []
    for c in children:
        # latest event today
        ev = await db.events.find_one(
            {"child_id": c["id"], "created_at": {"$gte": today}},
            {"_id": 0}, sort=[("created_at", -1)]
        )
        et = (ev or {}).get("event_type")
        if et == "no_show":
            status = "absent"
        elif et in ("picked_up", "arrived_school", "leaving_school", "arriving_home", "arrived_home", "alt_dropoff"):
            status = "picked_up"
        else:
            status = "pending"
        # enrich
        driver = await db.users.find_one({"id": c.get("driver_id")}, {"_id": 0, "password_hash": 0}) if c.get("driver_id") else None
        out.append({
            "child": c, "driver": driver, "status": status,
            "latest_event": ev,
        })
    counts = {"picked_up": 0, "pending": 0, "absent": 0}
    for o in out:
        counts[o["status"]] = counts.get(o["status"], 0) + 1
    return {"date": today, "counts": counts, "children": out}

@api.get("/admin/events")
async def admin_events_history(date: Optional[str] = None, driver_id: Optional[str] = None,
                                child_id: Optional[str] = None, user: dict = Depends(require_role("admin"))):
    """Daily route history. date=YYYY-MM-DD (defaults to today)."""
    d = date or now_utc().date().isoformat()
    q: dict = {"created_at": {"$gte": d, "$lt": d + "T99"}}
    if driver_id: q["driver_id"] = driver_id
    if child_id: q["child_id"] = child_id
    events = await db.events.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # Enrich with names
    for e in events:
        if e.get("child_id"):
            c = await db.children.find_one({"id": e["child_id"]}, {"_id": 0, "name": 1})
            e["child_name"] = c.get("name") if c else None
        if e.get("driver_id"):
            d2 = await db.users.find_one({"id": e["driver_id"]}, {"_id": 0, "name": 1})
            e["driver_name"] = d2.get("name") if d2 else None
    return events

@api.get("/admin/activity")
async def admin_activity(date: Optional[str] = None, user: dict = Depends(require_role("admin"))):
    """Chronological safety timeline for route, attendance, delay, and SOS events."""
    d = date or now_utc().date().isoformat()
    return await db.activity_events.find(
        {"created_at": {"$gte": d, "$lt": d + "T99"}}, {"_id": 0}
    ).sort("created_at", -1).limit(1000).to_list(1000)

@api.put("/admin/users/{uid}/compliance")
async def admin_driver_compliance(uid: str, data: DriverComplianceIn, user: dict = Depends(require_role("admin"))):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"id": uid}, {"$set": update})
    return {"ok": True}

@api.get("/admin/compliance-alerts")
async def admin_compliance_alerts(user: dict = Depends(require_role("admin"))):
    """Return vehicles/drivers with expiries within 30 days or already expired."""
    today = now_utc().date()
    horizon = (today + timedelta(days=30)).isoformat()
    today_s = today.isoformat()
    alerts = []
    async for v in db.vehicles.find({}, {"_id": 0}):
        for fld in ("registration_expiry", "insurance_expiry", "inspection_expiry"):
            d = v.get(fld)
            if d and d <= horizon:
                try:
                    days_left = (date.fromisoformat(d) - today).days
                except ValueError:
                    continue
                alerts.append({"kind": "vehicle", "item": v, "field": fld, "expires_on": d,
                               "expired": d < today_s, "days_left": days_left})
    async for d in db.users.find({"role": "driver"}, {"_id": 0, "password_hash": 0}):
        for fld in ("license_expiry", "permit_expiry"):
            dt = d.get(fld)
            if dt and dt <= horizon:
                try:
                    days_left = (date.fromisoformat(dt) - today).days
                except ValueError:
                    continue
                alerts.append({"kind": "driver", "item": d, "field": fld, "expires_on": dt,
                               "expired": dt < today_s, "days_left": days_left})
    return alerts

# ---------- Parent read-only child detail ----------
@api.get("/parent/child/{cid}")
async def parent_child_detail(cid: str, user: dict = Depends(require_role("parent"))):
    child = await db.children.find_one({"id": cid, "parent_id": user["id"]}, {"_id": 0})
    if not child:
        raise HTTPException(404, "Child not found")
    return await _enrich_child(child)

@api.put("/auth/notif-prefs")
async def update_prefs(prefs: NotifPrefsIn, user: dict = Depends(current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"notif_prefs": prefs.model_dump()}})
    return {"ok": True, "notif_prefs": prefs.model_dump()}

# ---------- Helpers to fetch joined data ----------
async def _enrich_child(child: dict, include_child_account: bool = False) -> dict:
    driver = None
    vehicle = None
    child_account = None
    if include_child_account:
        child_account = await db.users.find_one(
            {"role": "child", "child_id": child["id"]},
            {"_id": 0, "id": 1, "email": 1, "status": 1, "guardian_consent_confirmed_at": 1},
        )
    if child.get("driver_id"):
        driver = public_contact_user(await db.users.find_one({"id": child["driver_id"]}))
    if child.get("vehicle_id"):
        vehicle = await db.vehicles.find_one({"id": child["vehicle_id"]}, {"_id": 0})
    enriched = {**child, "driver": driver, "vehicle": vehicle}
    if include_child_account:
        enriched["child_account"] = child_account
    return enriched

# ---------- Parent ----------
@api.get("/parent/children")
async def parent_children(user: dict = Depends(require_role("parent"))):
    kids = await db.children.find({"parent_id": user["id"]}, {"_id": 0}).to_list(100)
    return [await _enrich_child(c) for c in kids]

@api.post("/parent/children", status_code=status.HTTP_201_CREATED)
async def parent_create_child(data: ParentChildIn, user: dict = Depends(require_role("parent"))):
    """Let an approved parent add their child and the child's restricted login."""
    doc = {
        "id": new_id(),
        "name": data.name.strip(),
        "parent_id": user["id"],
        "driver_id": None,
        "vehicle_id": None,
        "school": data.school.strip(),
        "pickup_time": data.pickup_time.strip(),
        "dropoff_time": data.dropoff_time.strip(),
        "home_address": data.home_address.strip(),
        "school_address": data.school_address.strip(),
        "birth_date": data.birth_date.strip() if data.birth_date else None,
        "grade": data.grade.strip() if data.grade else None,
        "round_trip": data.round_trip,
        "emergency_contact_name": data.emergency_contact_name.strip() if data.emergency_contact_name else None,
        "emergency_contact_phone": data.emergency_contact_phone.strip() if data.emergency_contact_phone else None,
        "contact_phone": data.contact_phone.strip() if data.contact_phone else None,
        "assignment_status": "pending_admin_assignment",
        "created_by_parent": True,
        "created_at": now_utc().isoformat(),
    }
    await db.children.insert_one(doc)
    try:
        child_account = await upsert_child_access(
            doc["id"],
            data.child_email.lower(),
            data.child_password,
            enabled=True,
            confirmed_by=user["id"],
        )
    except Exception:
        await db.children.delete_one({"id": doc["id"]})
        raise

    admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(20)
    notifications = [{
        "id": new_id(),
        "user_id": admin["id"],
        "type": "child_pending_assignment",
        "title": "Child added by parent",
        "body": f"{user['name']} added {doc['name']}. Assign a driver and vehicle.",
        "read": False,
        "created_at": now_utc().isoformat(),
    } for admin in admins]
    if notifications:
        await persist_notifications(notifications)
    clean_doc = {k: v for k, v in doc.items() if k != "_id"}
    return {**await _enrich_child(clean_doc), "child_account": child_account}

@api.get("/parent/dashboard")
async def parent_dashboard(user: dict = Depends(require_role("parent"))):
    kids = await db.children.find({"parent_id": user["id"]}, {"_id": 0}).to_list(100)
    enriched = []
    for c in kids:
        ec = await _enrich_child(c)
        # latest event
        ev = await db.events.find_one({"child_id": c["id"]}, {"_id": 0}, sort=[("created_at", -1)])
        ec["latest_event"] = ev
        enriched.append(ec)
    announcements = await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    return {"children": enriched, "announcements": announcements}

@api.get("/parent/track/{child_id}")
async def track_child(child_id: str, user: dict = Depends(require_role("parent"))):
    await refresh_development_demo_locations()
    child = await db.children.find_one({"id": child_id, "parent_id": user["id"]}, {"_id": 0})
    if not child:
        raise HTTPException(404, "Child not found")
    location = None
    route_points = []
    planned_route_points = []
    planned_addresses = []
    route_phase = None
    if child.get("driver_id"):
        location = fresh_location(await db.driver_locations.find_one({"driver_id": child["driver_id"]}, {"_id": 0}))
        if location and location.get("route_session_id"):
            recent_cutoff = (now_utc() - timedelta(minutes=2)).isoformat()
            route_points = await db.driver_route_points.find(
                {"driver_id": child["driver_id"], "route_session_id": location["route_session_id"],
                 "recorded_at": {"$gte": recent_cutoff}},
                {"_id": 0, "lat": 1, "lng": 1, "recorded_at": 1},
            ).sort("recorded_at", 1).to_list(100)
            plan = await db.driver_route_plans.find_one(
                {"driver_id": child["driver_id"], "route_session_id": location["route_session_id"]},
                {"_id": 0, "phase": 1, "points": 1},
            )
            if plan:
                route_phase = plan.get("phase")
                # The route geometry is shared for live tracking, but other families'
                # stop addresses remain private.
                planned_route_points = plan.get("points", [])
    events = await db.events.find({"child_id": child_id}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
    enriched = await _enrich_child(child)
    return {
        "child": enriched,
        "location": location,
        "route_points": route_points,
        "planned_route_points": planned_route_points,
        "planned_addresses": planned_addresses,
        "route_phase": route_phase,
        "events": events,
    }

# ---------- Child (restricted, read-only transportation view) ----------
@api.get("/child/track")
async def child_track(user: dict = Depends(require_role("child"))):
    await refresh_development_demo_locations()
    child_id = user.get("child_id")
    child = await db.children.find_one({"id": child_id}, {"_id": 0})
    if not child:
        raise HTTPException(404, "Child assignment not found")

    location = None
    route_points = []
    if child.get("driver_id"):
        location = fresh_location(await db.driver_locations.find_one(
            {"driver_id": child["driver_id"]}, {"_id": 0}
        ))
        if location and location.get("route_session_id"):
            recent_cutoff = (now_utc() - timedelta(minutes=2)).isoformat()
            route_points = await db.driver_route_points.find(
                {
                    "driver_id": child["driver_id"],
                    "route_session_id": location["route_session_id"],
                    "recorded_at": {"$gte": recent_cutoff},
                },
                {"_id": 0, "lat": 1, "lng": 1, "recorded_at": 1},
            ).sort("recorded_at", 1).to_list(100)

    driver_record = await db.users.find_one({"id": child.get("driver_id")}) if child.get("driver_id") else None
    driver = {
        key: driver_record.get(key)
        for key in ("id", "name", "phone", "photo_url")
        if driver_record and driver_record.get(key) is not None
    } if driver_record else None
    vehicle = await db.vehicles.find_one(
        {"id": child.get("vehicle_id")},
        {"_id": 0, "id": 1, "make": 1, "model": 1, "color": 1, "plate": 1, "photo_url": 1, "fleet_index": 1},
    ) if child.get("vehicle_id") else None
    events = await db.events.find(
        {"child_id": child["id"]},
        {"_id": 0, "id": 1, "event_type": 1, "message": 1, "created_at": 1},
    ).sort("created_at", -1).limit(10).to_list(10)

    # Do not expose guardian IDs, family addresses, other route stops, or other children.
    child_view = restricted_child_view(child)
    return {
        "child": child_view,
        "driver": driver,
        "vehicle": vehicle,
        "location": location,
        "route_points": route_points,
        "events": events,
    }

@api.post("/child/ready")
async def child_ready(user: dict = Depends(require_role("child"))):
    child = await db.children.find_one({"id": user.get("child_id")}, {"_id": 0})
    if not child:
        raise HTTPException(404, "Child assignment not found")
    cutoff = (now_utc() - timedelta(minutes=5)).isoformat()
    if await db.activity_events.find_one({
        "child_id": child["id"], "event_type": "child_ready", "created_at": {"$gte": cutoff}
    }):
        raise HTTPException(429, "Your driver was already notified. Please wait a few minutes.")

    recipients = [value for value in (child.get("parent_id"), child.get("driver_id")) if value]
    notifications = [{
        "id": new_id(), "user_id": recipient, "type": "child_ready",
        "title": f"{child['name']} is ready", "body": "Ready for the assigned pickup.",
        "read": False, "created_at": now_utc().isoformat(),
    } for recipient in recipients]
    if notifications:
        await persist_notifications(notifications)
    await db.activity_events.insert_one({
        "id": new_id(), "event_type": "child_ready", "child_id": child["id"],
        "driver_id": child.get("driver_id"), "title": f"{child['name']} is ready",
        "detail": "Child confirmed readiness for the assigned pickup.",
        "created_at": now_utc().isoformat(),
    })
    return {"ok": True, "message": "Your assigned driver and parent were notified."}

@api.post("/parent/schedule-request")
async def create_schedule_request(req: ScheduleRequestIn, user: dict = Depends(require_role("parent"))):
    child = await db.children.find_one({"id": req.child_id, "parent_id": user["id"]})
    if not child:
        raise HTTPException(404, "Child not found")
    doc = {"id": new_id(), "parent_id": user["id"], "status": "pending",
           "created_at": now_utc().isoformat(), **req.model_dump()}
    await db.schedule_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/parent/schedule-requests")
async def list_schedule_requests(user: dict = Depends(require_role("parent"))):
    return await db.schedule_requests.find({"parent_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)

# ---------- Driver ----------
@api.get("/driver/today")
async def driver_today(user: dict = Depends(require_role("driver"))):
    kids = await db.children.find({"driver_id": user["id"]}, {"_id": 0}).to_list(100)
    out = []
    for c in kids:
        parent = public_contact_user(await db.users.find_one({"id": c["parent_id"]}))
        ev = await db.events.find_one({"child_id": c["id"]}, {"_id": 0}, sort=[("created_at", -1)])
        out.append({**c, "parent": parent, "latest_event": ev})
    # sort by pickup_time
    out.sort(key=lambda x: x.get("pickup_time", "99:99"))
    return out

@api.post("/driver/checkin")
async def driver_checkin(data: CheckEventIn, user: dict = Depends(require_role("driver"))):
    child = await db.children.find_one({"id": data.child_id, "driver_id": user["id"]})
    if not child:
        raise HTTPException(404, "Child not assigned to you")
    ev = {
        "id": new_id(),
        "child_id": data.child_id,
        "driver_id": user["id"],
        "event_type": data.event_type,
        "message": data.message,
        "address": data.address,
        "created_at": now_utc().isoformat(),
    }
    await db.events.insert_one(ev)
    # notification for parent
    notif = {
        "id": new_id(),
        "user_id": child["parent_id"],
        "type": data.event_type,
        "title": _event_title(data.event_type, child["name"]),
        "body": data.message or _event_body(data.event_type, child["name"]),
        "read": False,
        "created_at": now_utc().isoformat(),
    }
    await persist_notification(notif)
    await db.activity_events.insert_one({
        "id": new_id(), "source_event_id": ev["id"],
        "type": data.event_type,
        "severity": "warning" if data.event_type in ("no_show", "delay") else "success",
        "title": _event_title(data.event_type, child["name"]),
        "detail": data.message or _event_body(data.event_type, child["name"]),
        "child_id": child["id"],
        "child_name": child["name"],
        "driver_id": user["id"],
        "driver_name": user["name"],
        "created_at": now_utc().isoformat(),
    })
    ev.pop("_id", None)
    return ev

def _event_title(t: str, name: str) -> str:
    return {
        "on_the_way": f"Driver on the way to {name}",
        "approaching": f"Driver is approaching {name}",
        "picked_up": f"{name} has been picked up",
        "arrived_school": f"{name} arrived at school",
        "leaving_school": f"{name} is leaving school",
        "arriving_home": f"{name} is almost home",
        "arrived_home": f"{name} arrived home",
        "delay": f"Traffic delay for {name}",
        "no_show": f"{name} did not show up for pickup",
        "alt_dropoff": f"{name} dropped at alternate address",
    }.get(t, t)

def _event_body(t: str, name: str) -> str:
    return {
        "on_the_way": f"Your driver is heading to pick up {name}.",
        "approaching": f"Your driver is approaching {name}'s pickup location.",
        "picked_up": f"{name} is safely in the vehicle.",
        "arrived_school": f"{name} arrived safely at school.",
        "leaving_school": f"{name} just left school.",
        "arriving_home": f"{name} will arrive home shortly.",
        "arrived_home": f"{name} was safely dropped off at home.",
        "delay": "There is a traffic delay on the route.",
        "no_show": f"{name} was not present at pickup location. Please contact your driver.",
        "alt_dropoff": f"{name} was dropped at an alternate location.",
    }.get(t, "")

@api.post("/driver/location")
async def driver_location(data: LocationIn, user: dict = Depends(require_role("driver"))):
    if not user.get("on_duty") or not user.get("route_session_id"):
        raise HTTPException(409, "Start an assigned route before sharing location")
    recorded_at = now_utc().isoformat()
    route_session_id = user.get("route_session_id")
    await db.driver_locations.update_one(
        {"driver_id": user["id"]},
        {"$set": {"driver_id": user["id"], "lat": data.lat, "lng": data.lng,
                  "route_session_id": route_session_id, "updated_at": recorded_at,
                  "expires_at": now_utc() + timedelta(seconds=45)}},
        upsert=True,
    )
    if user.get("on_duty") and route_session_id:
        await db.driver_route_points.insert_one({
            "id": new_id(), "driver_id": user["id"], "route_session_id": route_session_id,
            "lat": data.lat, "lng": data.lng, "recorded_at": recorded_at,
            "expires_at": now_utc() + timedelta(days=GPS_RETENTION_DAYS),
        })
    return {"ok": True}

@api.post("/driver/route/start")
async def route_start(data: RouteStartIn, user: dict = Depends(require_role("driver"))):
    precheck = {
        "seatbelts_checked": data.seatbelts_checked,
        "fuel_level_checked": data.fuel_level_checked,
        "phone_charged_and_mounted": data.phone_charged_and_mounted,
    }
    if not all(precheck.values()):
        raise HTTPException(400, "Complete the seatbelt, fuel, and mounted-phone checks before starting")
    phase = data.phase
    children = await db.children.find({"driver_id": user["id"]}, {"_id": 0}).to_list(100)
    if not children:
        raise HTTPException(400, "No children are assigned to this driver")
    route_session_id = new_id()
    await db.driver_route_points.delete_many({"driver_id": user["id"]})
    await db.driver_route_plans.delete_many({"driver_id": user["id"]})
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"on_duty": True, "route_session_id": route_session_id, "route_phase": phase}},
    )
    started_at = now_utc().isoformat()
    parent_notifications = []
    child_events = []
    for child in children:
        child_events.append({
            "id": new_id(), "child_id": child["id"], "driver_id": user["id"],
            "event_type": "on_the_way", "message": _event_body("on_the_way", child["name"]),
            "address": None, "created_at": started_at,
        })
        parent_notifications.append({
            "id": new_id(), "user_id": child["parent_id"], "type": "on_the_way",
            "title": _event_title("on_the_way", child["name"]),
            "body": _event_body("on_the_way", child["name"]), "read": False,
            "created_at": started_at,
        })
    if child_events:
        await db.events.insert_many(child_events)
    if parent_notifications:
        await persist_notifications(parent_notifications)
    await db.activity_events.insert_one({
        "id": new_id(), "type": "route_started", "severity": "info",
        "title": f"{user['name']} started the route",
        "detail": f"Pre-route check completed · {len(children)} children assigned",
        "driver_id": user["id"], "driver_name": user["name"],
        "route_session_id": route_session_id, "route_phase": phase,
        "pre_route_check": precheck, "created_at": started_at,
    })
    return {"ok": True, "on_duty": True, "route_session_id": route_session_id, "route_phase": phase}

@api.post("/driver/route/plan")
async def route_plan(data: RoutePlanIn, user: dict = Depends(require_role("driver"))):
    route_session_id = user.get("route_session_id")
    if not user.get("on_duty") or not route_session_id:
        raise HTTPException(400, "Start the route before saving its planned path")
    if len(data.points) < 2:
        raise HTTPException(400, "Planned route needs at least two points")
    if len(data.points) > 1000:
        raise HTTPException(400, "Planned route is too detailed")
    doc = {
        "id": new_id(),
        "driver_id": user["id"],
        "route_session_id": route_session_id,
        "phase": data.phase,
        "addresses": data.addresses,
        "points": [point.model_dump() for point in data.points],
        "created_at": now_utc().isoformat(),
        "expires_at": now_utc() + timedelta(days=GPS_RETENTION_DAYS),
    }
    await db.driver_route_plans.update_one(
        {"driver_id": user["id"], "route_session_id": route_session_id},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True, "point_count": len(doc["points"]), "addresses": doc["addresses"]}

@api.post("/driver/route/end")
async def route_end(data: Optional[RouteEndIn] = None, user: dict = Depends(require_role("driver"))):
    safety = data or RouteEndIn()
    ended_at = now_utc().isoformat()
    children = await db.children.find({"driver_id": user["id"]}, {"_id": 0}).to_list(100)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"on_duty": False}, "$unset": {"route_session_id": "", "route_phase": ""}},
    )
    await db.driver_locations.delete_one({"driver_id": user["id"]})
    await db.activity_events.insert_one({
        "id": new_id(), "type": "route_completed", "severity": "success",
        "title": f"{user['name']} completed the route",
        "detail": "Vehicle empty check confirmed" if safety.vehicle_checked_empty else "Route ended",
        "driver_id": user["id"], "driver_name": user["name"],
        "safety_check": safety.model_dump(), "created_at": ended_at,
    })
    notifications = [{
        "id": new_id(), "user_id": child["parent_id"], "type": "route_completed",
        "title": "Route completed", "body": f"{user['name']} completed today's route and final vehicle check.",
        "read": False, "created_at": ended_at,
    } for child in children]
    if notifications:
        await persist_notifications(notifications)
    return {"ok": True, "on_duty": False, "safety_check": safety.model_dump()}

@api.post("/driver/emergency")
async def driver_emergency(data: EmergencyIn, user: dict = Depends(require_role("driver"))):
    created_at = now_utc().isoformat()
    admins = await db.users.find({"role": "admin", "status": {"$ne": "suspended"}}, {"_id": 0, "password_hash": 0}).to_list(50)
    activity = {
        "id": new_id(), "type": "emergency", "severity": "critical",
        "title": f"SOS from {user['name']}",
        "detail": data.message or "Driver requested immediate administrator assistance.",
        "driver_id": user["id"], "driver_name": user["name"],
        "lat": data.lat, "lng": data.lng, "created_at": created_at,
    }
    await db.activity_events.insert_one(activity)
    notifications = [{
        "id": new_id(), "user_id": admin["id"], "type": "emergency",
        "title": activity["title"], "body": activity["detail"], "read": False,
        "lat": data.lat, "lng": data.lng, "created_at": created_at,
    } for admin in admins]
    if notifications:
        await persist_notifications(notifications)
    return {
        "ok": True,
        "alerted_admins": len(admins),
        "admin_phone": next((admin.get("phone") for admin in admins if admin.get("phone")), None),
    }

# ---------- Chat ----------
async def can_chat(user: dict, other_user_id: str, child_id: Optional[str] = None) -> bool:
    if user.get("role") == "parent":
        query = {"parent_id": user["id"], "driver_id": other_user_id}
    elif user.get("role") == "driver":
        query = {"driver_id": user["id"], "parent_id": other_user_id}
    else:
        return False
    if child_id:
        query["id"] = child_id
    return await db.children.find_one(query, {"_id": 0, "id": 1}) is not None

@api.get("/chat/conversations")
async def chat_conversations(user: dict = Depends(current_user)):
    # for parent: list assigned drivers; for driver: list parents of assigned kids
    contacts = []
    if user["role"] == "parent":
        kids = await db.children.find({"parent_id": user["id"]}, {"_id": 0}).to_list(100)
        seen = set()
        for c in kids:
            if c.get("driver_id") and c["driver_id"] not in seen:
                seen.add(c["driver_id"])
                d = public_contact_user(await db.users.find_one({"id": c["driver_id"]}))
                if d:
                    contacts.append({"user": d, "child_name": c["name"]})
    elif user["role"] == "driver":
        kids = await db.children.find({"driver_id": user["id"]}, {"_id": 0}).to_list(100)
        seen = set()
        for c in kids:
            if c["parent_id"] not in seen:
                seen.add(c["parent_id"])
                p = public_contact_user(await db.users.find_one({"id": c["parent_id"]}))
                if p:
                    contacts.append({"user": p, "child_name": c["name"]})
    return contacts

@api.get("/chat/messages/{other_user_id}")
async def chat_messages(other_user_id: str, user: dict = Depends(current_user)):
    if not await can_chat(user, other_user_id):
        raise HTTPException(403, "Messaging is limited to active child assignments")
    msgs = await db.messages.find({
        "$or": [
            {"from_user_id": user["id"], "to_user_id": other_user_id},
            {"from_user_id": other_user_id, "to_user_id": user["id"]},
        ]
    }, {"_id": 0}).sort("created_at", 1).to_list(500)
    return msgs

@api.post("/chat/send")
async def chat_send(data: MessageIn, user: dict = Depends(current_user)):
    text = data.text.strip()
    if not text:
        raise HTTPException(400, "Message cannot be blank")
    if not await can_chat(user, data.to_user_id, data.child_id):
        raise HTTPException(403, "Messaging is limited to active child assignments")
    msg = {
        "id": new_id(),
        "from_user_id": user["id"],
        "to_user_id": data.to_user_id,
        "text": text,
        "child_id": data.child_id,
        "created_at": now_utc().isoformat(),
    }
    await db.messages.insert_one(msg)
    recipient = await db.users.find_one({"id": data.to_user_id}, {"_id": 0, "password_hash": 0})
    if recipient and {user.get("role"), recipient.get("role")} == {"parent", "driver"}:
        child = await db.children.find_one({"id": data.child_id}, {"_id": 0, "name": 1}) if data.child_id else None
        await persist_notification({
            "id": new_id(),
            "user_id": recipient["id"],
            "type": "message",
            "title": f"Message from {user['name']}",
            "body": text,
            "child_id": data.child_id,
            "read": False,
            "created_at": msg["created_at"],
        })
        await db.activity_events.insert_one({
            "id": new_id(), "type": "message", "severity": "info",
            "title": f"Message from {user['name']} to {recipient['name']}",
            "detail": text,
            "child_id": data.child_id,
            "child_name": child.get("name") if child else None,
            "driver_id": user["id"] if user.get("role") == "driver" else recipient["id"],
            "driver_name": user["name"] if user.get("role") == "driver" else recipient["name"],
            "created_at": msg["created_at"],
        })
    msg.pop("_id", None)
    return msg

# ---------- Notifications ----------
@api.get("/notifications")
async def list_notifications(user: dict = Depends(current_user)):
    notifs = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return notifs

@api.post("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, user: dict = Depends(current_user)):
    await db.notifications.update_one({"id": notif_id, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}

# ---------- Admin ----------
@api.get("/admin/users")
async def admin_users(role: Optional[str] = None, user: dict = Depends(require_role("admin"))):
    q = {"role": role} if role else {}
    users = await db.users.find(q, {"_id": 0, "password_hash": 0}).to_list(500)
    return users

@api.delete("/admin/users/{uid}")
async def admin_delete_user(uid: str, user: dict = Depends(require_role("admin"))):
    target = await db.users.find_one({"id": uid})
    if not target:
        raise HTTPException(404, "User not found")
    if target.get("role") == "admin":
        raise HTTPException(400, "Administrator accounts cannot be deleted from the app")
    await delete_service_account(target)
    return {"ok": True}

@api.get("/admin/children")
async def admin_children(user: dict = Depends(require_role("admin"))):
    kids = await db.children.find({}, {"_id": 0}).to_list(500)
    return [await _enrich_child(c, include_child_account=True) for c in kids]

@api.post("/admin/children")
async def admin_create_child(data: ChildIn, user: dict = Depends(require_role("admin"))):
    doc = {"id": new_id(), **data.model_dump(), "created_at": now_utc().isoformat()}
    await db.children.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/admin/children/{cid}")
async def admin_update_child(cid: str, data: ChildIn, user: dict = Depends(require_role("admin"))):
    await db.children.update_one({"id": cid}, {"$set": data.model_dump()})
    await db.users.update_one({"role": "child", "child_id": cid}, {"$set": {"name": data.name.strip()}})
    c = await db.children.find_one({"id": cid}, {"_id": 0})
    return c

@api.put("/admin/children/{cid}/access")
async def admin_set_child_access(cid: str, data: ChildAccessIn, user: dict = Depends(require_role("admin"))):
    """Create or update the restricted login tied to one existing child record."""
    if not data.guardian_consent_confirmed:
        raise HTTPException(400, "Confirm parent or guardian authorization before enabling child access")
    return await upsert_child_access(
        cid,
        data.email.lower(),
        data.password,
        enabled=data.enabled,
        confirmed_by=user["id"],
    )

@api.delete("/admin/children/{cid}/access")
async def admin_delete_child_access(cid: str, user: dict = Depends(require_role("admin"))):
    account = await db.users.find_one({"role": "child", "child_id": cid})
    if account:
        await delete_service_account(account)
    return {"ok": True}

@api.delete("/admin/children/{cid}")
async def admin_delete_child(cid: str, user: dict = Depends(require_role("admin"))):
    account = await db.users.find_one({"role": "child", "child_id": cid})
    if account:
        await delete_service_account(account)
    await db.events.delete_many({"child_id": cid})
    await db.activity_events.delete_many({"child_id": cid})
    await db.messages.delete_many({"child_id": cid})
    await db.schedule_requests.delete_many({"child_id": cid})
    await db.routes.update_many({}, {"$pull": {"child_ids": cid}})
    await db.children.delete_one({"id": cid})
    return {"ok": True}

@api.get("/admin/vehicles")
async def admin_vehicles(user: dict = Depends(require_role("admin"))):
    return await db.vehicles.find({}, {"_id": 0}).to_list(200)

@api.post("/admin/vehicles")
async def admin_create_vehicle(data: VehicleIn, user: dict = Depends(require_role("admin"))):
    doc = {"id": new_id(), **data.model_dump(), "created_at": now_utc().isoformat()}
    await db.vehicles.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/admin/live-routes")
async def admin_live_routes(user: dict = Depends(require_role("admin"))):
    await refresh_development_demo_locations()
    drivers = await db.users.find({"role": "driver"}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(200)
    route_colors = ["#D4AF37", "#3B82F6", "#EF4444", "#10B981", "#A855F7", "#F97316", "#06B6D4", "#EC4899", "#84CC16", "#E5E7EB"]
    out = []
    for index, d in enumerate(drivers):
        loc = fresh_location(await db.driver_locations.find_one({"driver_id": d["id"]}, {"_id": 0}))
        kids = await db.children.find({"driver_id": d["id"]}, {"_id": 0}).to_list(50)
        route = await db.routes.find_one({"driver_id": d["id"]}, {"_id": 0})
        vehicle_id = (route or {}).get("vehicle_id") or next((kid.get("vehicle_id") for kid in kids if kid.get("vehicle_id")), None)
        vehicle = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0}) if vehicle_id else None
        route_points = []
        planned_route_points = []
        if loc and loc.get("route_session_id"):
            route_points = await db.driver_route_points.find(
                {"driver_id": d["id"], "route_session_id": loc["route_session_id"]},
                {"_id": 0, "lat": 1, "lng": 1, "recorded_at": 1},
            ).sort("recorded_at", 1).to_list(500)
            plan = await db.driver_route_plans.find_one(
                {"driver_id": d["id"], "route_session_id": loc["route_session_id"]},
                {"_id": 0},
            )
            if plan:
                planned_route_points = plan.get("points", [])
        out.append({
            "driver": d,
            "vehicle": vehicle,
            "location": loc,
            "children": kids,
            "route_id": (route or {}).get("id"),
            "route_name": (route or {}).get("name") or f"Route {index + 1:02d}",
            "route_color": (route or {}).get("route_color") or route_colors[index % len(route_colors)],
            "route_points": route_points,
            "planned_route_points": planned_route_points,
        })
    return out

@api.post("/admin/announcement")
async def admin_announce(data: AnnouncementIn, user: dict = Depends(require_role("admin"))):
    doc = {"id": new_id(), **data.model_dump(), "created_by": user["id"], "created_at": now_utc().isoformat()}
    await db.announcements.insert_one(doc)
    doc.pop("_id", None)
    # fan-out notifications to all parents
    parents = await db.users.find({"role": "parent"}, {"_id": 0, "id": 1}).to_list(1000)
    notifs = [{
        "id": new_id(),
        "user_id": p["id"],
        "type": "announcement",
        "title": data.title,
        "body": data.body,
        "category": data.category,
        "read": False,
        "created_at": now_utc().isoformat(),
    } for p in parents]
    if notifs:
        await persist_notifications(notifs)
    return doc

@api.get("/admin/schedule-requests")
async def admin_schedule_requests(user: dict = Depends(require_role("admin"))):
    return await db.schedule_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.get("/announcements")
async def list_announcements(user: dict = Depends(current_user)):
    return await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)


# ---------- Migration ----------
async def migrate_statuses():
    """Ensure all users have a status field (for legacy demo seeds)."""
    await db.users.update_many(
        {"role": {"$in": ["parent", "driver", "child", "admin"]}, "status": {"$exists": False}},
        {"$set": {"status": "active"}}
    )

# ---------- Admin bootstrap and legacy demo cleanup ----------
async def ensure_admin():
    """Keep one environment-controlled administrator without hard-coded credentials."""
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    values = {
        "email": ADMIN_EMAIL,
        "role": "admin",
        "status": "active",
        "notif_prefs": NotifPrefsIn().model_dump(),
    }
    if existing:
        if not verify_pw(ADMIN_PASSWORD, existing.get("password_hash", "")):
            values["password_hash"] = hash_pw(ADMIN_PASSWORD)
        await db.users.update_one({"id": existing["id"]}, {"$set": values})
        return
    await db.users.insert_one({
        "id": new_id(),
        "name": "VIP Kids Administrator",
        "phone": None,
        "created_at": now_utc().isoformat(),
        "password_hash": hash_pw(ADMIN_PASSWORD),
        **values,
    })

async def remove_legacy_demo_data():
    """Remove only the original fictional seed records; never delete customer-created data."""
    migration_id = "remove_legacy_demo_data_v1"
    if await db.migrations.find_one({"id": migration_id}):
        await db.children.update_many({"photo_url": {"$exists": True}}, {"$unset": {"photo_url": ""}})
        return
    demo_emails = [
        "driver@vipkids.com", "driver2@vipkids.com",
        "parent@vipkids.com", "parent2@vipkids.com",
    ]
    demo_users = await db.users.find({"email": {"$in": demo_emails}}, {"_id": 0, "id": 1}).to_list(20)
    demo_user_ids = [item["id"] for item in demo_users]
    demo_vehicles = await db.vehicles.find({"plate": {"$in": ["VIP-001", "VIP-002"]}}, {"_id": 0, "id": 1}).to_list(20)
    demo_vehicle_ids = [item["id"] for item in demo_vehicles]
    demo_children = await db.children.find({
        "$or": [
            {"parent_id": {"$in": demo_user_ids}},
            {"driver_id": {"$in": demo_user_ids}},
            {"vehicle_id": {"$in": demo_vehicle_ids}},
        ]
    }, {"_id": 0, "id": 1}).to_list(100)
    demo_child_ids = [item["id"] for item in demo_children]
    if demo_child_ids:
        await db.events.delete_many({"child_id": {"$in": demo_child_ids}})
    if demo_user_ids:
        await db.users.delete_many({"id": {"$in": demo_user_ids}})
        await db.notifications.delete_many({"user_id": {"$in": demo_user_ids}})
        await db.messages.delete_many({"$or": [
            {"from_user_id": {"$in": demo_user_ids}},
            {"to_user_id": {"$in": demo_user_ids}},
        ]})
        await db.driver_locations.delete_many({"driver_id": {"$in": demo_user_ids}})
        await db.driver_route_points.delete_many({"driver_id": {"$in": demo_user_ids}})
        await db.driver_route_plans.delete_many({"driver_id": {"$in": demo_user_ids}})
    if demo_child_ids:
        await db.children.delete_many({"id": {"$in": demo_child_ids}})
    if demo_vehicle_ids:
        await db.vehicles.delete_many({"id": {"$in": demo_vehicle_ids}})
    if demo_user_ids or demo_vehicle_ids or demo_child_ids:
        await db.routes.delete_many({"$or": [
            {"driver_id": {"$in": demo_user_ids}},
            {"vehicle_id": {"$in": demo_vehicle_ids}},
            {"child_ids": {"$in": demo_child_ids}},
        ]})
    await db.children.update_many({"photo_url": {"$exists": True}}, {"$unset": {"photo_url": ""}})
    await db.migrations.insert_one({"id": migration_id, "applied_at": now_utc().isoformat()})

async def ensure_development_demo_accounts():
    """Seed demo accounts for phone testing and permanent app-store reviewer logins."""
    if not demo_accounts_enabled():
        return
    password = os.environ.get("DEMO_PASSWORD", "vipdemo123")

    async def upsert_demo_user(email: str, fallback_id: str, values: dict) -> str:
        existing = await db.users.find_one({"email": email})
        user_id = existing["id"] if existing else fallback_id
        doc = {
            "id": user_id,
            "email": email,
            "password_hash": hash_pw(password),
            "status": "active",
            "notif_prefs": NotifPrefsIn().model_dump(),
            "updated_at": now_utc().isoformat(),
            **values,
        }
        if existing:
            await db.users.update_one({"id": user_id}, {"$set": doc})
        else:
            await db.users.insert_one({"created_at": now_utc().isoformat(), **doc})
        return user_id

    await upsert_demo_user("admin.demo@vipkidstest.com", "demo-admin-1", {
        "name": "Demo Administrator",
        "role": "admin",
        "phone": "305-555-0000",
    })
    demo_fleet = [
        ("Alexander Demo", "Ari Demo", "Hyundai", "Palisade", "B8UFT"),
        ("Bianca Rivera", "Maya Rivera", "Cadillac", "Escalade", "VIP2KD"),
        ("Carlos Bennett", "Noah Bennett", "Chevrolet", "Suburban", "VIP3KD"),
        ("Diana Morales", "Luna Morales", "GMC", "Yukon XL", "VIP4KD"),
        ("Ethan Collins", "Eli Collins", "Lincoln", "Navigator", "VIP5KD"),
        ("Farah Williams", "Zoe Williams", "Mercedes-Benz", "GLS 580", "VIP6KD"),
        ("Gabriel Stone", "Miles Stone", "Toyota", "Sequoia", "VIP7KD"),
        ("Helena Cruz", "Sofia Cruz", "Lexus", "LX 600", "VIP8KD"),
        ("Isaac Morgan", "Leo Morgan", "Jeep", "Wagoneer", "VIP9KD"),
        ("Jasmine Lee", "Ava Lee", "Infiniti", "QX80", "VIP10K"),
    ]
    schools = [
        "VIP Academy", "Pinecrest Prep", "Coral Gables Day School", "Brickell Scholars",
        "Biscayne Grove Academy", "Sunset Preparatory", "Coconut Grove Collegiate",
        "Design District Academy", "Key Biscayne School", "Aventura Learning Center",
    ]
    route_colors = ["#D4AF37", "#3B82F6", "#EF4444", "#10B981", "#A855F7", "#F97316", "#06B6D4", "#EC4899", "#84CC16", "#E5E7EB"]
    base_lat = 25.76170
    base_lng = -80.19180

    for idx, (driver_name, child_name, make, model, plate) in enumerate(demo_fleet, start=1):
        suffix = "" if idx == 1 else str(idx)
        parent_email = f"parent{suffix}.demo@vipkidstest.com"
        driver_email = f"driver{suffix}.demo@vipkidstest.com"
        child_email = f"child{suffix}.demo@vipkidstest.com"
        parent_id = await upsert_demo_user(parent_email, f"demo-parent-{idx}", {
            "name": f"{child_name.split()[0]} Parent",
            "role": "parent",
            "phone": f"305-555-01{idx:02d}",
            "address": f"{100 + idx} Demo Palm Ave, Miami, FL",
        })
        driver_id = await upsert_demo_user(driver_email, f"demo-driver-{idx}", {
            "name": driver_name,
            "role": "driver",
            "phone": f"305-555-02{idx:02d}",
            "photo_url": None,
            "license_number": f"DEMO-DRIVER-{idx:03d}",
            "license_expiry": f"2027-12-{min(20 + idx, 28):02d}",
        })

        vehicle_id = f"demo-vehicle-{idx}"
        await db.vehicles.update_one(
            {"id": vehicle_id},
            {"$set": {
                "id": vehicle_id,
                "make": make,
                "model": model,
                "plate": plate,
                "color": "Black",
                "year": 2024 + (idx % 2),
                "driver_id": driver_id,
                "fleet_index": idx - 1,
                "seats": 7,
                "registration_date": "2026-01-01",
                "registration_expiry": f"2027-{((idx - 1) % 9) + 1:02d}-01",
                "insurance_expiry": f"2027-{((idx + 2) % 9) + 1:02d}-15",
                "inspection_expiry": f"2027-{((idx + 4) % 9) + 1:02d}-20",
                "updated_at": now_utc().isoformat(),
            }},
            upsert=True,
        )

        child_id = f"demo-child-{idx}"
        school = schools[idx - 1]
        await db.children.update_one(
            {"id": child_id},
            {"$set": {
                "id": child_id,
                "name": child_name,
                "parent_id": parent_id,
                "driver_id": driver_id,
                "vehicle_id": vehicle_id,
                "school": school,
                "pickup_time": f"07:{20 + idx:02d}",
                "dropoff_time": f"15:{10 + idx:02d}",
                "home_address": f"{100 + idx} Demo Palm Ave, Miami, FL",
                "school_address": f"{200 + idx} Academy Way, Miami, FL",
                "grade": str((idx % 6) + 1),
                "round_trip": True,
                "emergency_contact_name": f"{child_name.split()[0]} Emergency Contact",
                "emergency_contact_phone": f"305-555-03{idx:02d}",
                "assignment_status": "assigned",
                "created_at": now_utc().isoformat(),
            }},
            upsert=True,
        )
        await upsert_child_access(
            child_id,
            child_email,
            password,
            enabled=True,
            confirmed_by=parent_id,
        )

        route_id = f"demo-route-{idx}"
        await db.routes.update_one(
            {"id": route_id},
            {"$set": {
                "id": route_id,
                "name": f"VIP Route {idx:02d}",
                "school": school,
                "driver_id": driver_id,
                "vehicle_id": vehicle_id,
                "child_ids": [child_id],
                "route_color": route_colors[idx - 1],
                "notes": "Development demo route",
                "updated_at": now_utc().isoformat(),
            }},
            upsert=True,
        )

        offset_lat = (idx - 1) * 0.006
        offset_lng = (idx - 1) * 0.004
        session_id = f"demo-live-session-{idx}"
        demo_points = [
            {"lat": base_lat + offset_lat, "lng": base_lng + offset_lng},
            {"lat": base_lat + offset_lat + 0.0015, "lng": base_lng + offset_lng + 0.0031},
            {"lat": base_lat + offset_lat + 0.0034, "lng": base_lng + offset_lng + 0.0062},
            {"lat": base_lat + offset_lat + 0.0054, "lng": base_lng + offset_lng + 0.0096},
        ]
        await db.driver_locations.update_one(
            {"driver_id": driver_id},
            {"$set": {
                "id": f"demo-location-{idx}",
                "driver_id": driver_id,
                "lat": demo_points[-1]["lat"],
                "lng": demo_points[-1]["lng"],
                "updated_at": now_utc().isoformat(),
                "route_session_id": session_id,
                "expires_at": now_utc() + timedelta(minutes=30),
            }},
            upsert=True,
        )
        await db.driver_route_plans.update_one(
            {"driver_id": driver_id, "route_session_id": session_id},
            {"$set": {
                "driver_id": driver_id,
                "route_session_id": session_id,
                "phase": "morning",
                "points": demo_points,
                "expires_at": now_utc() + timedelta(minutes=30),
                "created_at": now_utc().isoformat(),
            }},
            upsert=True,
        )
        await db.driver_route_points.delete_many({"driver_id": driver_id, "route_session_id": session_id})
        await db.driver_route_points.insert_many([
            {
                "id": f"demo-route-point-{idx}-{point_idx}",
                "driver_id": driver_id,
                "route_session_id": session_id,
                "lat": point["lat"],
                "lng": point["lng"],
                "recorded_at": (now_utc() - timedelta(seconds=(len(demo_points) - point_idx) * 5)).isoformat(),
                "expires_at": now_utc() + timedelta(minutes=30),
            }
            for point_idx, point in enumerate(demo_points)
        ])

@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.children.create_index("parent_id")
    await db.children.create_index("driver_id")
    await db.driver_locations.create_index("driver_id", unique=True)
    await db.driver_locations.create_index("expires_at", expireAfterSeconds=0)
    await db.driver_route_points.create_index([("driver_id", 1), ("route_session_id", 1), ("recorded_at", 1)])
    await db.driver_route_points.create_index("expires_at", expireAfterSeconds=0)
    await db.driver_route_plans.create_index("expires_at", expireAfterSeconds=0)
    await db.auth_rate_limits.create_index("expires_at", expireAfterSeconds=0)
    await migrate_statuses()
    await remove_legacy_demo_data()
    await ensure_admin()
    await ensure_development_demo_accounts()

@app.on_event("shutdown")
async def on_shutdown():
    client.close()

@api.get("/")
async def root():
    return {"service": "VIP KIDS TRANSPORTATION API", "status": "ok", "environment": ENVIRONMENT}

@api.get("/health/live")
async def health_live():
    return {"status": "ok"}

@api.get("/health/ready")
async def health_ready():
    try:
        await db.command("ping")
    except Exception:
        raise HTTPException(503, "Database unavailable")
    return {"status": "ready"}

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
