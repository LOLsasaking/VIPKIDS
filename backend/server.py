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

class VehicleIn(BaseModel):
    make: str
    model: str
    plate: str
    color: str

class CheckEventIn(BaseModel):
    child_id: str
    event_type: Literal["on_the_way", "picked_up", "arrived_school", "leaving_school", "arriving_home", "delay"]
    message: Optional[str] = None

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
@api.post("/auth/register", response_model=TokenOut)
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
        "created_at": now_utc().isoformat(),
        "notif_prefs": NotifPrefsIn().model_dump(),
    }
    await db.users.insert_one(doc)
    public = {k: v for k, v in doc.items() if k != "password_hash"}
    return TokenOut(access_token=make_token(uid, data.role), user=public)

@api.post("/auth/login", response_model=TokenOut)
async def login(data: LoginIn):
    u = await db.users.find_one({"email": data.email.lower()})
    if not u or not verify_pw(data.password, u["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    public = {k: v for k, v in u.items() if k not in ("password_hash", "_id")}
    return TokenOut(access_token=make_token(u["id"], u["role"]), user=public)

@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return user

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
    }.get(t, t)

def _event_body(t: str, name: str) -> str:
    return {
        "on_the_way": f"Your driver is heading to pick up {name}.",
        "picked_up": f"{name} is safely in the vehicle.",
        "arrived_school": f"{name} arrived safely at school.",
        "leaving_school": f"{name} just left school.",
        "arriving_home": f"{name} will arrive home shortly.",
        "delay": "There is a traffic delay on the route.",
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
        "created_at": now_utc().isoformat(), "notif_prefs": NotifPrefsIn().model_dump(),
    }
    parent2 = {
        "id": new_id(), "email": "parent2@vipkids.com", "password_hash": hash_pw("parent123"),
        "name": "David Chen", "role": "parent", "phone": "+1-954-555-0302",
        "photo_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200",
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
