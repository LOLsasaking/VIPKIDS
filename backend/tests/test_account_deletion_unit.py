import unittest
import sys
from pathlib import Path
from unittest.mock import AsyncMock

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class FakeCursor:
    def __init__(self, items):
        self.items = items

    async def to_list(self, _limit):
        return self.items


class FakeCollection:
    def __init__(self, find_items=None):
        self.find_items = find_items or []
        self.delete_many = AsyncMock()
        self.delete_one = AsyncMock()
        self.update_many = AsyncMock()

    def find(self, *_args, **_kwargs):
        return FakeCursor(self.find_items)


class FakeDB:
    def __init__(self, children=None):
        self.messages = FakeCollection()
        self.notifications = FakeCollection()
        self.children = FakeCollection(children)
        self.events = FakeCollection()
        self.activity_events = FakeCollection()
        self.schedule_requests = FakeCollection()
        self.routes = FakeCollection()
        self.vehicles = FakeCollection()
        self.driver_locations = FakeCollection()
        self.driver_route_points = FakeCollection()
        self.driver_route_plans = FakeCollection()
        self.users = FakeCollection()


class AccountDeletionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.original_db = server.db

    async def asyncTearDown(self):
        server.db = self.original_db

    async def test_parent_deletion_cascades_child_data(self):
        fake = FakeDB(children=[{"id": "child-1"}, {"id": "child-2"}])
        server.db = fake

        await server.delete_service_account({"id": "parent-1", "role": "parent"})

        fake.events.delete_many.assert_awaited_once_with({"child_id": {"$in": ["child-1", "child-2"]}})
        fake.users.delete_many.assert_awaited_once_with({"role": "child", "child_id": {"$in": ["child-1", "child-2"]}})
        fake.routes.update_many.assert_awaited_once_with({}, {"$pull": {"child_ids": {"$in": ["child-1", "child-2"]}}})
        fake.children.delete_many.assert_awaited_once_with({"id": {"$in": ["child-1", "child-2"]}})
        fake.users.delete_one.assert_awaited_once_with({"id": "parent-1"})

    async def test_driver_deletion_unassigns_and_removes_location(self):
        fake = FakeDB()
        server.db = fake

        await server.delete_service_account({"id": "driver-1", "role": "driver", "on_duty": False})

        fake.children.update_many.assert_awaited_once_with({"driver_id": "driver-1"}, {"$unset": {"driver_id": ""}})
        fake.driver_locations.delete_many.assert_awaited_once_with({"driver_id": "driver-1"})
        fake.driver_route_points.delete_many.assert_awaited_once_with({"driver_id": "driver-1"})
        fake.users.delete_one.assert_awaited_once_with({"id": "driver-1"})

    async def test_active_driver_must_end_route_first(self):
        fake = FakeDB()
        server.db = fake

        with self.assertRaises(HTTPException) as context:
            await server.delete_service_account({"id": "driver-1", "role": "driver", "on_duty": True})

        self.assertEqual(context.exception.status_code, 409)
        fake.users.delete_one.assert_not_awaited()

    async def test_child_deletion_removes_login_but_keeps_transport_record(self):
        fake = FakeDB()
        server.db = fake

        await server.delete_service_account({"id": "child-user-1", "role": "child", "child_id": "child-1"})

        fake.users.delete_one.assert_awaited_once_with({"id": "child-user-1"})
        fake.children.delete_many.assert_not_awaited()
        fake.children.update_many.assert_not_awaited()

    async def test_restricted_child_view_hides_family_and_route_identifiers(self):
        result = server.restricted_child_view({
            "id": "child-1", "name": "Jordan", "school": "Example School",
            "pickup_time": "07:30", "emergency_contact_phone": "555-0100",
            "parent_id": "parent-1", "driver_id": "driver-1", "vehicle_id": "vehicle-1",
            "home_address": "Private home", "school_address": "Private school stop",
            "birth_date": "2014-01-01", "contact_phone": "555-0111",
        })

        self.assertEqual(result["name"], "Jordan")
        self.assertNotIn("parent_id", result)
        self.assertNotIn("driver_id", result)
        self.assertNotIn("home_address", result)
        self.assertNotIn("birth_date", result)


if __name__ == "__main__":
    unittest.main()
