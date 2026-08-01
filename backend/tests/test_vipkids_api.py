"""VIP KIDS TRANSPORTATION — Comprehensive backend tests."""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_BACKEND_INTEGRATION") != "1",
    reason="set RUN_BACKEND_INTEGRATION=1 with an isolated test backend to run destructive API tests",
)

ADMIN = {"email": "admin@vipkids.com", "password": "admin123"}
DRIVER = {"email": "driver@vipkids.com", "password": "driver123"}
PARENT = {"email": "parent@vipkids.com", "password": "parent123"}


@pytest.fixture(scope="session")
def tokens():
    out = {}
    for role, creds in [("admin", ADMIN), ("driver", DRIVER), ("parent", PARENT)]:
        r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
        assert r.status_code == 200, f"login {role} failed: {r.status_code} {r.text}"
        j = r.json()
        out[role] = {"token": j["access_token"], "user": j["user"]}
    return out


def hdr(t): return {"Authorization": f"Bearer {t}"}


# -------- AUTH --------
class TestAuth:
    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "x@x.com", "password": "bad"}, timeout=20)
        assert r.status_code == 401

    def test_me_all_roles(self, tokens):
        for role in ["admin", "driver", "parent"]:
            r = requests.get(f"{API}/auth/me", headers=hdr(tokens[role]["token"]), timeout=20)
            assert r.status_code == 200
            assert r.json()["role"] == role
            assert "password_hash" not in r.json()

    def test_notif_prefs_update(self, tokens):
        r = requests.put(f"{API}/auth/notif-prefs",
                         headers=hdr(tokens["parent"]["token"]),
                         json={"on_the_way": False, "picked_up": True, "arrived_school": True,
                               "leaving_school": True, "arriving_home": True, "delay": True,
                               "announcements": True, "mute_all": False}, timeout=20)
        assert r.status_code == 200
        assert r.json()["notif_prefs"]["on_the_way"] is False


# -------- PARENT --------
class TestParent:
    def test_dashboard(self, tokens):
        r = requests.get(f"{API}/parent/dashboard", headers=hdr(tokens["parent"]["token"]), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "children" in d and "announcements" in d
        assert len(d["children"]) >= 1
        c0 = d["children"][0]
        assert "driver" in c0 and "vehicle" in c0
        assert c0["driver"] is not None

    def test_track_child(self, tokens):
        d = requests.get(f"{API}/parent/dashboard", headers=hdr(tokens["parent"]["token"]), timeout=20).json()
        cid = d["children"][0]["id"]
        r = requests.get(f"{API}/parent/track/{cid}", headers=hdr(tokens["parent"]["token"]), timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "child" in j and "events" in j

    def test_schedule_request_create_and_list(self, tokens):
        d = requests.get(f"{API}/parent/dashboard", headers=hdr(tokens["parent"]["token"]), timeout=20).json()
        cid = d["children"][0]["id"]
        payload = {"child_id": cid, "request_type": "medical_appointment",
                   "when": "2026-02-01T10:00", "notes": "TEST_appt"}
        r = requests.post(f"{API}/parent/schedule-request", headers=hdr(tokens["parent"]["token"]),
                          json=payload, timeout=20)
        assert r.status_code == 200
        assert r.json()["status"] == "pending"
        lst = requests.get(f"{API}/parent/schedule-requests", headers=hdr(tokens["parent"]["token"]), timeout=20)
        assert lst.status_code == 200
        assert any(x.get("notes") == "TEST_appt" for x in lst.json())

    def test_parent_blocked_from_driver(self, tokens):
        r = requests.get(f"{API}/driver/today", headers=hdr(tokens["parent"]["token"]), timeout=20)
        assert r.status_code == 403

    def test_parent_blocked_from_admin(self, tokens):
        r = requests.get(f"{API}/admin/users", headers=hdr(tokens["parent"]["token"]), timeout=20)
        assert r.status_code == 403


# -------- DRIVER --------
class TestDriver:
    def test_today(self, tokens):
        r = requests.get(f"{API}/driver/today", headers=hdr(tokens["driver"]["token"]), timeout=20)
        assert r.status_code == 200
        kids = r.json()
        assert len(kids) >= 1
        # sorted by pickup_time
        times = [k.get("pickup_time", "") for k in kids]
        assert times == sorted(times)

    def test_location_and_route(self, tokens):
        t = tokens["driver"]["token"]
        r = requests.post(f"{API}/driver/route/start", headers=hdr(t), timeout=20)
        assert r.status_code == 200 and r.json()["on_duty"] is True
        r = requests.post(f"{API}/driver/location", headers=hdr(t),
                          json={"lat": 26.0112, "lng": -80.1495}, timeout=20)
        assert r.status_code == 200
        # verify via admin live-routes
        adm = requests.get(f"{API}/admin/live-routes", headers=hdr(tokens["admin"]["token"]), timeout=20)
        assert adm.status_code == 200
        found = [d for d in adm.json() if d["driver"]["id"] == tokens["driver"]["user"]["id"]]
        assert found and found[0]["location"]["lat"] == 26.0112
        r = requests.post(f"{API}/driver/route/end", headers=hdr(t), timeout=20)
        assert r.status_code == 200 and r.json()["on_duty"] is False

    def test_checkin_creates_event_and_notif(self, tokens):
        kids = requests.get(f"{API}/driver/today", headers=hdr(tokens["driver"]["token"]), timeout=20).json()
        cid = kids[0]["id"]
        parent_id = kids[0]["parent_id"]
        r = requests.post(f"{API}/driver/checkin", headers=hdr(tokens["driver"]["token"]),
                          json={"child_id": cid, "event_type": "picked_up", "message": "TEST_pickup"},
                          timeout=20)
        assert r.status_code == 200
        assert r.json()["event_type"] == "picked_up"
        # parent should see notification
        nots = requests.get(f"{API}/notifications", headers=hdr(tokens["parent"]["token"]), timeout=20)
        assert nots.status_code == 200
        # parent user must equal parent_id - confirm
        assert tokens["parent"]["user"]["id"] == parent_id
        assert any(n["type"] == "picked_up" for n in nots.json())

    def test_driver_blocked_from_parent(self, tokens):
        r = requests.get(f"{API}/parent/dashboard", headers=hdr(tokens["driver"]["token"]), timeout=20)
        assert r.status_code == 403


# -------- CHAT --------
class TestChat:
    def test_conversations_and_send(self, tokens):
        # parent should see driver
        convs = requests.get(f"{API}/chat/conversations", headers=hdr(tokens["parent"]["token"]), timeout=20)
        assert convs.status_code == 200
        peers = convs.json()
        assert len(peers) >= 1
        driver_id = peers[0]["user"]["id"]
        # parent sends to driver
        s = requests.post(f"{API}/chat/send", headers=hdr(tokens["parent"]["token"]),
                          json={"to_user_id": driver_id, "text": "TEST_hello"}, timeout=20)
        assert s.status_code == 200
        # driver reads
        msgs = requests.get(f"{API}/chat/messages/{tokens['parent']['user']['id']}",
                            headers=hdr(tokens["driver"]["token"]), timeout=20)
        assert msgs.status_code == 200
        assert any(m["text"] == "TEST_hello" for m in msgs.json())


# -------- ADMIN --------
class TestAdmin:
    def test_users_filter(self, tokens):
        r = requests.get(f"{API}/admin/users?role=parent", headers=hdr(tokens["admin"]["token"]), timeout=20)
        assert r.status_code == 200
        assert all(u["role"] == "parent" for u in r.json())

    def test_children(self, tokens):
        r = requests.get(f"{API}/admin/children", headers=hdr(tokens["admin"]["token"]), timeout=20)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_live_routes(self, tokens):
        r = requests.get(f"{API}/admin/live-routes", headers=hdr(tokens["admin"]["token"]), timeout=20)
        assert r.status_code == 200

    def test_announcement_fanout(self, tokens):
        r = requests.post(f"{API}/admin/announcement", headers=hdr(tokens["admin"]["token"]),
                          json={"title": "TEST_Snow Day", "body": "School closed", "category": "weather"},
                          timeout=20)
        assert r.status_code == 200
        nots = requests.get(f"{API}/notifications", headers=hdr(tokens["parent"]["token"]), timeout=20).json()
        assert any(n.get("type") == "announcement" and n["title"] == "TEST_Snow Day" for n in nots)

    def test_admin_blocked_from_driver(self, tokens):
        r = requests.get(f"{API}/driver/today", headers=hdr(tokens["admin"]["token"]), timeout=20)
        assert r.status_code == 403
