import datetime as dt
import unittest
from zoneinfo import ZoneInfo

from organizer_notifications import build_organizer_digest

MOSCOW = ZoneInfo("Europe/Moscow")


class OrganizerNotificationDigestTests(unittest.TestCase):
    def test_warns_about_low_registration_thinking_payments_and_unresolved_attendance(self):
        now = dt.datetime(2026, 9, 4, 18, 0, tzinfo=MOSCOW)
        starts_at = (now + dt.timedelta(hours=2)).isoformat()
        evenings = [{
            "id": "e1",
            "title": "Пятничная мафия",
            "starts_at": starts_at,
            "status": "published",
            "capacity": 13,
        }]
        participants = [
            {
                "nickname": f"Игрок {index}",
                "response_status": "going",
                "attendance_status": "pending",
                "payment_status": "unpaid",
                "amount_due": 500,
                "amount_paid": 0,
            }
            for index in range(1, 9)
        ]
        participants.append({
            "nickname": "Думающий",
            "response_status": "thinking",
            "attendance_status": "pending",
            "payment_status": "unpaid",
            "amount_due": 500,
            "amount_paid": 0,
        })
        digest = build_organizer_digest(
            evenings,
            {"e1": {"participants": participants}},
            {"e1": {"underfilled_slots": [{"title": "Игра 2"}]}},
            now=now,
        )
        self.assertIsNotNone(digest)
        self.assertIn("Запись: 8/10", digest)
        self.assertIn("Думают (1): Думающий", digest)
        self.assertIn("Не заполнены игровые слоты: Игра 2", digest)
        self.assertIn("Оплата под контролем (8)", digest)

    def test_reports_ready_roster_close_to_start(self):
        now = dt.datetime(2026, 9, 4, 18, 0, tzinfo=MOSCOW)
        evenings = [{
            "id": "e2",
            "title": "Вечер",
            "starts_at": (now + dt.timedelta(hours=1)).isoformat(),
            "status": "published",
            "capacity": 13,
        }]
        participants = [
            {
                "nickname": f"P{index}",
                "response_status": "going",
                "attendance_status": "pending",
                "payment_status": "paid",
                "amount_due": 500,
                "amount_paid": 500,
            }
            for index in range(10)
        ]
        digest = build_organizer_digest(evenings, {"e2": {"participants": participants}}, {}, now=now)
        self.assertIn("По людям готово: подтверждено 10", digest)

    def test_stays_quiet_for_far_future_evening(self):
        now = dt.datetime(2026, 9, 4, 18, 0, tzinfo=MOSCOW)
        evenings = [{
            "id": "e3",
            "title": "Будущий вечер",
            "starts_at": (now + dt.timedelta(days=20)).isoformat(),
            "status": "published",
            "capacity": 13,
            "attending_count": 2,
        }]
        self.assertIsNone(build_organizer_digest(evenings, {}, {}, now=now))


if __name__ == "__main__":
    unittest.main()
