"""VIP KIDS Phase 2 — private provisioning, parent activation, no_show, photo upload."""
import os
import time
import uuid
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@vipkids.com", "password": "admin123"}
DRIVER = {"email": "driver@vipkids.com", "password": "driver123"}
PARENT = {"email": "parent@vipkids.com", "password": "parent123"}


def hdr(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def driver_info():
    r = requests.post(f"{API}/auth/login", json=DRIVER, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    return {"token": j["access_token"], "user": j["user"]}


# Module-level state for created users so dependent tests can find them
_state = {}


# --------- Seeded users still login ---------
class TestSeededLogins:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=20)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

    def test_driver_login(self):
        r = requests.post(f"{API}/auth/login", json=DRIVER, timeout=20)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "driver"

    def test_parent_login_active(self):
        r = requests.post(f"{API}/auth/login", json=PARENT, timeout=20)
        assert r.status_code == 200
        assert r.json()["user"]["status"] == "active"


# --------- Public self-registration is not available ---------
class TestPublicRegistrationDisabled:
    def test_public_registration_route_is_absent(self):
        r = requests.post(f"{API}/auth/register",
                          json={"email": "no-self-signup@example.com", "password": "secret123",
                                "name": "No Signup", "role": "parent"},
                          timeout=20)
        assert r.status_code == 404


# --------- Concierge/admin provisions approved service users ---------
class TestAdminProvisioning:
    def test_admin_provisions_parent(self, admin_token):
        email = f"test_parent_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/admin/users", headers=hdr(admin_token),
                          json={"email": email, "password": "secret123",
                                "name": "TEST Parent", "role": "parent", "phone": "+1-555-0000"},
                          timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "approved"
        _state["parent_email"] = email
        _state["parent_pwd"] = "secret123"
        _state["parent_id"] = body["id"]

    def test_admin_provisions_driver(self, admin_token):
        email = f"test_driver_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/admin/users", headers=hdr(admin_token),
                          json={"email": email, "password": "secret123",
                                "name": "TEST Driver", "role": "driver"},
                          timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "active"
        _state["driver_email"] = email
        _state["driver_pwd"] = "secret123"
        _state["driver_id"] = r.json()["id"]

    def test_admin_cannot_provision_duplicate(self, admin_token):
        email = _state.get("parent_email")
        r = requests.post(f"{API}/admin/users", headers=hdr(admin_token),
                          json={"email": email, "password": "secret123",
                                "name": "X", "role": "parent"}, timeout=20)
        assert r.status_code == 400


# --------- Parent stays blocked until a complete assignment ---------
class TestProvisionedLoginGate:
    def test_approved_parent_blocked(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": _state["parent_email"], "password": _state["parent_pwd"]},
                          timeout=20)
        assert r.status_code == 403
        assert "driver assignment" in r.text.lower() or "awaiting" in r.text.lower()

    def test_active_driver_can_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": _state["driver_email"], "password": _state["driver_pwd"]},
                          timeout=20)
        assert r.status_code == 200


# --------- Activate parent flow ---------
class TestActivateParent:
    def test_activate_fails_no_children(self, admin_token):
        r = requests.post(f"{API}/admin/activate-parent/{_state['parent_id']}",
                          headers=hdr(admin_token), timeout=20)
        assert r.status_code == 400
        assert "child" in r.text.lower()

    def test_add_child_without_driver(self, admin_token):
        payload = {
            "name": "TEST Child",
            "parent_id": _state["parent_id"],
            "school": "TEST School",
            "pickup_time": "07:30",
            "dropoff_time": "15:30",
            "home_address": "1 Test Way",
            "school_address": "2 Test Ave",
        }
        r = requests.post(f"{API}/admin/children", headers=hdr(admin_token),
                          json=payload, timeout=20)
        assert r.status_code == 200
        _state["child_id"] = r.json()["id"]

    def test_activate_fails_child_no_driver(self, admin_token):
        r = requests.post(f"{API}/admin/activate-parent/{_state['parent_id']}",
                          headers=hdr(admin_token), timeout=20)
        assert r.status_code == 400
        assert "driver" in r.text.lower()

    def test_assign_driver_vehicle(self, admin_token):
        # get vehicles
        vs = requests.get(f"{API}/admin/vehicles", headers=hdr(admin_token), timeout=20).json()
        assert vs
        vid = vs[0]["id"]
        # use the new driver
        r = requests.put(f"{API}/admin/children/{_state['child_id']}/assign",
                         headers=hdr(admin_token),
                         json={"driver_id": _state["driver_id"], "vehicle_id": vid},
                         timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["driver_id"] == _state["driver_id"]
        assert body["vehicle_id"] == vid

    def test_activate_succeeds(self, admin_token):
        r = requests.post(f"{API}/admin/activate-parent/{_state['parent_id']}",
                          headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200
        assert r.json()["status"] == "active"

    def test_activated_parent_can_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": _state["parent_email"], "password": _state["parent_pwd"]},
                          timeout=20)
        assert r.status_code == 200
        _state["parent_token"] = r.json()["access_token"]


# --------- Photo upload endpoints ---------
class TestPhotoUpload:
    SMALL_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

    def test_user_photo_self(self):
        token = _state["parent_token"]
        r = requests.put(f"{API}/auth/photo", headers=hdr(token),
                         json={"photo_url": self.SMALL_B64}, timeout=20)
        assert r.status_code == 200
        # verify via /auth/me
        me = requests.get(f"{API}/auth/me", headers=hdr(token), timeout=20).json()
        assert me["photo_url"] == self.SMALL_B64

    def test_child_photo(self, admin_token):
        r = requests.put(f"{API}/admin/children/{_state['child_id']}/photo",
                         headers=hdr(admin_token),
                         json={"photo_url": self.SMALL_B64}, timeout=20)
        assert r.status_code == 200
        # verify via admin/children
        kids = requests.get(f"{API}/admin/children", headers=hdr(admin_token), timeout=20).json()
        kid = next(k for k in kids if k["id"] == _state["child_id"])
        assert kid["photo_url"] == self.SMALL_B64


# --------- Driver no_show event ---------
class TestNoShowEvent:
    def test_driver_checkin_no_show_creates_notification(self):
        # login new driver
        r = requests.post(f"{API}/auth/login",
                          json={"email": _state["driver_email"], "password": _state["driver_pwd"]},
                          timeout=20)
        assert r.status_code == 200
        dtoken = r.json()["access_token"]
        # checkin no_show on assigned child
        r = requests.post(f"{API}/driver/checkin", headers=hdr(dtoken),
                          json={"child_id": _state["child_id"], "event_type": "no_show"},
                          timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["event_type"] == "no_show"
        # parent receives notification
        nots = requests.get(f"{API}/notifications",
                            headers=hdr(_state["parent_token"]), timeout=20).json()
        assert any(n["type"] == "no_show" for n in nots), f"no_show not in notifications"


# --------- Reject flow ---------
class TestReject:
    def test_reject_deletes_user(self, admin_token):
        # Provision a fresh parent through the private concierge/admin path.
        email = f"test_reject_{uuid.uuid4().hex[:8]}@example.com"
        created = requests.post(f"{API}/admin/users", headers=hdr(admin_token),
                                json={"email": email, "password": "secret123",
                                      "name": "Reject Me", "role": "parent"}, timeout=20)
        assert created.status_code == 200
        uid = created.json()["id"]
        r = requests.post(f"{API}/admin/reject/{uid}", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200
        # login should fail with 401 (user no longer exists)
        r2 = requests.post(f"{API}/auth/login",
                           json={"email": email, "password": "secret123"}, timeout=20)
        assert r2.status_code == 401


# --------- Cleanup ---------
class TestZCleanup:
    def test_cleanup(self, admin_token):
        # delete created child + users
        if _state.get("child_id"):
            requests.delete(f"{API}/admin/children/{_state['child_id']}",
                            headers=hdr(admin_token), timeout=20)
        for key in ("parent_id", "driver_id"):
            if _state.get(key):
                requests.delete(f"{API}/admin/users/{_state[key]}",
                                headers=hdr(admin_token), timeout=20)
