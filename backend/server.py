"""VIP KIDS TRANSPORTATION — FastAPI backend.
Premium school chauffeur app with JWT auth (parent/driver/admin), live GPS, chat,
check-in/out events, schedule requests, announcements.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Literal
from datetime import datetime, timedelta, timezone
from pathlib import Path
from jose import jwt, JWTError
import bcrypt
import os
import uuid
import logging

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

# ---------- Config ----------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "vip-kids-secret-change-me-prod")
JWT_ALGO = "HS256"
JWT_TTL_DAYS = 30

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="VIP KIDS TRANSPORTATION API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("vipkids")

# ---------- Helpers ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

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
        "exp": now_utc() + timedelta(days=JWT_TTL_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except JWTError:
        return None

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
    return user

def require_role(*roles: str):
    async def checker(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return user
    return checker

# ---------- Models ----------
Role = Literal["parent", "driver", "admin"]

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: Role
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    address: Optional[str] = None  # for parents

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class ChildIn(BaseModel):
    name: str
    photo_url: Optional[str] = None
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

class VehicleIn(BaseModel):
    make: str
    model: str
    plate: str
    color: str
    year: Optional[int] = None
    photo_url: Optional[str] = None
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
    event_type: Literal["on_the_way", "picked_up", "arrived_school", "leaving_school", "arriving_home", "delay", "no_show", "alt_dropoff"]
    message: Optional[str] = None
    address: Optional[str] = None  # for alt_dropoff

class LocationIn(BaseModel):
    lat: float
    lng: float

class MessageIn(BaseModel):
    to_user_id: str
    text: str
    child_id: Optional[str] = None

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
    picked_up: bool = True
    arrived_school: bool = True
    leaving_school: bool = True
    arriving_home: bool = True
    delay: bool = True
    announcements: bool = True
    mute_all: bool = False

# ---------- Auth ----------
@api.post("/auth/register")
async def register(data: RegisterIn):
    if await db.users.find_one({"email": data.email.lower()}):
        raise HTTPException(400, "Email already registered")
    uid = new_id()
    doc = {
        "id": uid,
        "email": data.email.lower(),
        "password_hash": hash_pw(data.password),
        "name": data.name,
        "role": data.role,
        "phone": data.phone,
        "photo_url": data.photo_url,
        "address": data.address,
        "status": "pending",
        "created_at": now_utc().isoformat(),
        "notif_prefs": NotifPrefsIn().model_dump(),
    }
    await db.users.insert_one(doc)
    return {"ok": True, "message": "Account submitted. Awaiting admin approval.", "status": "pending"}

@api.post("/auth/login", response_model=TokenOut)
async def login(data: LoginIn):
    u = await db.users.find_one({"email": data.email.lower()})
    if not u or not verify_pw(data.password, u["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    if u.get("status") == "pending":
        raise HTTPException(403, "Account pending admin approval")
    if u.get("status") == "suspended":
        raise HTTPException(403, "Account suspended. Contact your administrator.")
    if u.get("role") == "parent" and u.get("status") != "active":
        raise HTTPException(403, "Awaiting driver assignment by admin")
    public = {k: v for k, v in u.items() if k not in ("password_hash", "_id")}
    return TokenOut(access_token=make_token(u["id"], u["role"]), user=public)

@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return user

class PhotoIn(BaseModel):
    photo_url: str

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

class ChildPhotoIn(BaseModel):
    photo_url: str

@api.put("/admin/children/{cid}/photo")
async def admin_child_photo(cid: str, data: ChildPhotoIn, user: dict = Depends(require_role("admin"))):
    await db.children.update_one({"id": cid}, {"$set": {"photo_url": data.photo_url}})
    return {"ok": True}

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
    new_status = "active" if u.get("role") in ("driver", "admin") else "approved"
    await db.users.update_one({"id": uid}, {"$set": {"status": new_status}})
    return {"ok": True, "status": new_status}

class DriverComplianceIn(BaseModel):
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
        elif et in ("picked_up", "arrived_school", "leaving_school", "arriving_home", "alt_dropoff"):
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

@api.put("/admin/users/{uid}")  # already declared above; keep idempotent for older import order
async def _noop(): pass

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
                alerts.append({"kind": "vehicle", "item": v, "field": fld, "expires_on": d, "expired": d < today_s})
    async for d in db.users.find({"role": "driver"}, {"_id": 0, "password_hash": 0}):
        for fld in ("license_expiry", "permit_expiry"):
            dt = d.get(fld)
            if dt and dt <= horizon:
                alerts.append({"kind": "driver", "item": d, "field": fld, "expires_on": dt, "expired": dt < today_s})
    return alerts

# ---------- Payments ----------
class PaymentIn(BaseModel):
    parent_id: str
    month: str  # YYYY-MM
    amount: float
    status: Literal["paid", "pending", "overdue"] = "pending"
    notes: Optional[str] = None

@api.get("/admin/payments")
async def admin_list_payments(month: Optional[str] = None, user: dict = Depends(require_role("admin"))):
    q = {"month": month} if month else {}
    pays = await db.payments.find(q, {"_id": 0}).sort("month", -1).to_list(500)
    for p in pays:
        parent = await db.users.find_one({"id": p["parent_id"]}, {"_id": 0, "password_hash": 0})
        p["parent"] = parent
    return pays

@api.post("/admin/payments")
async def admin_create_payment(data: PaymentIn, user: dict = Depends(require_role("admin"))):
    doc = {"id": new_id(), **data.model_dump(), "created_at": now_utc().isoformat()}
    await db.payments.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/admin/payments/{pid}")
async def admin_update_payment(pid: str, data: PaymentIn, user: dict = Depends(require_role("admin"))):
    await db.payments.update_one({"id": pid}, {"$set": data.model_dump()})
    return {"ok": True}

@api.delete("/admin/payments/{pid}")
async def admin_delete_payment(pid: str, user: dict = Depends(require_role("admin"))):
    await db.payments.delete_one({"id": pid})
    return {"ok": True}

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
async def _enrich_child(child: dict) -> dict:
    driver = None
    vehicle = None
    if child.get("driver_id"):
        driver = await db.users.find_one({"id": child["driver_id"]}, {"_id": 0, "password_hash": 0})
    if child.get("vehicle_id"):
        vehicle = await db.vehicles.find_one({"id": child["vehicle_id"]}, {"_id": 0})
    return {**child, "driver": driver, "vehicle": vehicle}

# ---------- Parent ----------
@api.get("/parent/children")
async def parent_children(user: dict = Depends(require_role("parent"))):
    kids = await db.children.find({"parent_id": user["id"]}, {"_id": 0}).to_list(100)
    return [await _enrich_child(c) for c in kids]

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
    child = await db.children.find_one({"id": child_id, "parent_id": user["id"]}, {"_id": 0})
    if not child:
        raise HTTPException(404, "Child not found")
    location = None
    if child.get("driver_id"):
        location = await db.driver_locations.find_one({"driver_id": child["driver_id"]}, {"_id": 0})
    events = await db.events.find({"child_id": child_id}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
    enriched = await _enrich_child(child)
    return {"child": enriched, "location": location, "events": events}

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
        parent = await db.users.find_one({"id": c["parent_id"]}, {"_id": 0, "password_hash": 0})
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
    await db.notifications.insert_one(notif)
    ev.pop("_id", None)
    return ev

def _event_title(t: str, name: str) -> str:
    return {
        "on_the_way": f"Driver on the way to {name}",
        "picked_up": f"{name} has been picked up",
        "arrived_school": f"{name} arrived at school",
        "leaving_school": f"{name} is leaving school",
        "arriving_home": f"{name} is almost home",
        "delay": f"Traffic delay for {name}",
        "no_show": f"{name} did not show up for pickup",
        "alt_dropoff": f"{name} dropped at alternate address",
    }.get(t, t)

def _event_body(t: str, name: str) -> str:
    return {
        "on_the_way": f"Your driver is heading to pick up {name}.",
        "picked_up": f"{name} is safely in the vehicle.",
        "arrived_school": f"{name} arrived safely at school.",
        "leaving_school": f"{name} just left school.",
        "arriving_home": f"{name} will arrive home shortly.",
        "delay": "There is a traffic delay on the route.",
        "no_show": f"{name} was not present at pickup location. Please contact your driver.",
        "alt_dropoff": f"{name} was dropped at an alternate location.",
    }.get(t, "")

@api.post("/driver/location")
async def driver_location(data: LocationIn, user: dict = Depends(require_role("driver"))):
    await db.driver_locations.update_one(
        {"driver_id": user["id"]},
        {"$set": {"driver_id": user["id"], "lat": data.lat, "lng": data.lng,
                  "updated_at": now_utc().isoformat()}},
        upsert=True,
    )
    return {"ok": True}

@api.post("/driver/route/start")
async def route_start(user: dict = Depends(require_role("driver"))):
    await db.users.update_one({"id": user["id"]}, {"$set": {"on_duty": True}})
    return {"ok": True, "on_duty": True}

@api.post("/driver/route/end")
async def route_end(user: dict = Depends(require_role("driver"))):
    await db.users.update_one({"id": user["id"]}, {"$set": {"on_duty": False}})
    await db.driver_locations.delete_one({"driver_id": user["id"]})
    return {"ok": True, "on_duty": False}

# ---------- Chat ----------
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
                d = await db.users.find_one({"id": c["driver_id"]}, {"_id": 0, "password_hash": 0})
                if d:
                    contacts.append({"user": d, "child_name": c["name"]})
    elif user["role"] == "driver":
        kids = await db.children.find({"driver_id": user["id"]}, {"_id": 0}).to_list(100)
        seen = set()
        for c in kids:
            if c["parent_id"] not in seen:
                seen.add(c["parent_id"])
                p = await db.users.find_one({"id": c["parent_id"]}, {"_id": 0, "password_hash": 0})
                if p:
                    contacts.append({"user": p, "child_name": c["name"]})
    return contacts

@api.get("/chat/messages/{other_user_id}")
async def chat_messages(other_user_id: str, user: dict = Depends(current_user)):
    msgs = await db.messages.find({
        "$or": [
            {"from_user_id": user["id"], "to_user_id": other_user_id},
            {"from_user_id": other_user_id, "to_user_id": user["id"]},
        ]
    }, {"_id": 0}).sort("created_at", 1).to_list(500)
    return msgs

@api.post("/chat/send")
async def chat_send(data: MessageIn, user: dict = Depends(current_user)):
    msg = {
        "id": new_id(),
        "from_user_id": user["id"],
        "to_user_id": data.to_user_id,
        "text": data.text,
        "child_id": data.child_id,
        "created_at": now_utc().isoformat(),
    }
    await db.messages.insert_one(msg)
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

@api.post("/admin/users")
async def admin_create_user(data: RegisterIn, user: dict = Depends(require_role("admin"))):
    if await db.users.find_one({"email": data.email.lower()}):
        raise HTTPException(400, "Email already registered")
    uid = new_id()
    doc = {
        "id": uid, "email": data.email.lower(), "password_hash": hash_pw(data.password),
        "name": data.name, "role": data.role, "phone": data.phone, "photo_url": data.photo_url,
        "created_at": now_utc().isoformat(), "notif_prefs": NotifPrefsIn().model_dump(),
    }
    await db.users.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "password_hash" and k != "_id"}

@api.delete("/admin/users/{uid}")
async def admin_delete_user(uid: str, user: dict = Depends(require_role("admin"))):
    await db.users.delete_one({"id": uid})
    return {"ok": True}

@api.get("/admin/children")
async def admin_children(user: dict = Depends(require_role("admin"))):
    kids = await db.children.find({}, {"_id": 0}).to_list(500)
    return [await _enrich_child(c) for c in kids]

@api.post("/admin/children")
async def admin_create_child(data: ChildIn, user: dict = Depends(require_role("admin"))):
    doc = {"id": new_id(), **data.model_dump(), "created_at": now_utc().isoformat()}
    await db.children.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/admin/children/{cid}")
async def admin_update_child(cid: str, data: ChildIn, user: dict = Depends(require_role("admin"))):
    await db.children.update_one({"id": cid}, {"$set": data.model_dump()})
    c = await db.children.find_one({"id": cid}, {"_id": 0})
    return c

@api.delete("/admin/children/{cid}")
async def admin_delete_child(cid: str, user: dict = Depends(require_role("admin"))):
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
    drivers = await db.users.find({"role": "driver"}, {"_id": 0, "password_hash": 0}).to_list(200)
    out = []
    for d in drivers:
        loc = await db.driver_locations.find_one({"driver_id": d["id"]}, {"_id": 0})
        kids = await db.children.find({"driver_id": d["id"]}, {"_id": 0}).to_list(50)
        out.append({"driver": d, "location": loc, "children": kids})
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
        await db.notifications.insert_many(notifs)
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
        {"role": {"$in": ["parent", "driver", "admin"]}, "status": {"$exists": False}},
        {"$set": {"status": "active"}}
    )

# ---------- Seed ----------
async def seed_demo_data():
    if await db.users.count_documents({}) > 0:
        log.info("Seed: users exist, skipping")
        return
    log.info("Seeding demo data...")

    # Admin
    admin = {
        "id": new_id(), "email": "admin@vipkids.com", "password_hash": hash_pw("admin123"),
        "name": "Marcus Hollings", "role": "admin", "phone": "+1-954-555-0100",
        "photo_url": "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200",
        "created_at": now_utc().isoformat(), "notif_prefs": NotifPrefsIn().model_dump(),
    }
    # Drivers
    driver1 = {
        "id": new_id(), "email": "driver@vipkids.com", "password_hash": hash_pw("driver123"),
        "name": "James Whitfield", "role": "driver", "phone": "+1-954-555-0201",
        "photo_url": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=300",
        "created_at": now_utc().isoformat(), "on_duty": False,
        "notif_prefs": NotifPrefsIn().model_dump(),
    }
    driver2 = {
        "id": new_id(), "email": "driver2@vipkids.com", "password_hash": hash_pw("driver123"),
        "name": "Robert Alvarez", "role": "driver", "phone": "+1-954-555-0202",
        "photo_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300",
        "created_at": now_utc().isoformat(), "on_duty": False,
        "notif_prefs": NotifPrefsIn().model_dump(),
    }
    # Parents
    parent1 = {
        "id": new_id(), "email": "parent@vipkids.com", "password_hash": hash_pw("parent123"),
        "name": "Isabella Sterling", "role": "parent", "phone": "+1-954-555-0301",
        "photo_url": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200",
        "status": "active",
        "created_at": now_utc().isoformat(), "notif_prefs": NotifPrefsIn().model_dump(),
    }
    parent2 = {
        "id": new_id(), "email": "parent2@vipkids.com", "password_hash": hash_pw("parent123"),
        "name": "David Chen", "role": "parent", "phone": "+1-954-555-0302",
        "photo_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200",
        "status": "active",
        "created_at": now_utc().isoformat(), "notif_prefs": NotifPrefsIn().model_dump(),
    }
    await db.users.insert_many([admin, driver1, driver2, parent1, parent2])

    # Vehicles
    v1 = {"id": new_id(), "make": "Cadillac", "model": "Escalade", "plate": "VIP-001", "color": "Obsidian Black"}
    v2 = {"id": new_id(), "make": "Mercedes-Benz", "model": "S-Class", "plate": "VIP-002", "color": "Onyx"}
    await db.vehicles.insert_many([v1, v2])

    # Children
    c1 = {
        "id": new_id(), "name": "Olivia Sterling",
        "photo_url": "https://images.unsplash.com/photo-1519457431-44ccd64a579b?w=300",
        "parent_id": parent1["id"], "driver_id": driver1["id"], "vehicle_id": v1["id"],
        "school": "Pine Crest School", "pickup_time": "07:15", "dropoff_time": "15:30",
        "home_address": "2400 Hollywood Blvd, Hollywood, FL",
        "school_address": "1501 NE 62nd St, Fort Lauderdale, FL",
        "created_at": now_utc().isoformat(),
    }
    c2 = {
        "id": new_id(), "name": "Henry Sterling",
        "photo_url": "https://images.unsplash.com/photo-1503944583220-79d8926ad5e2?w=300",
        "parent_id": parent1["id"], "driver_id": driver1["id"], "vehicle_id": v1["id"],
        "school": "Pine Crest School", "pickup_time": "07:15", "dropoff_time": "15:30",
        "home_address": "2400 Hollywood Blvd, Hollywood, FL",
        "school_address": "1501 NE 62nd St, Fort Lauderdale, FL",
        "created_at": now_utc().isoformat(),
    }
    c3 = {
        "id": new_id(), "name": "Sophia Chen",
        "photo_url": "https://images.unsplash.com/photo-1595967596797-9fcae3ca6c19?w=300",
        "parent_id": parent2["id"], "driver_id": driver2["id"], "vehicle_id": v2["id"],
        "school": "American Heritage School", "pickup_time": "07:30", "dropoff_time": "15:45",
        "home_address": "100 N Federal Hwy, Hollywood, FL",
        "school_address": "12200 W Broward Blvd, Plantation, FL",
        "created_at": now_utc().isoformat(),
    }
    await db.children.insert_many([c1, c2, c3])
    log.info("Seed complete.")

@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.children.create_index("parent_id")
    await db.children.create_index("driver_id")
    await migrate_statuses()
    await seed_demo_data()

@app.on_event("shutdown")
async def on_shutdown():
    client.close()

@api.get("/")
async def root():
    return {"service": "VIP KIDS TRANSPORTATION API", "status": "ok"}

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
