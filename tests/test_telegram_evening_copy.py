from handlers.telegram_evening_copy import event_base_text


def test_novice_announcement_shows_briefing_and_free_first_evenings():
    text = event_base_text({"format": "NOVICE", "title": "Школа", "starts_at": "2026-09-25T16:00:00.000Z", "default_price": 200})
    assert "🎓 Брифинг для новичков — 18:30, первая игра — 19:00" in text
    assert "Первые 2 вечера — бесплатно, дальше 200 ₽ за игру" in text


def test_casual_announcement_has_no_briefing():
    text = event_base_text({"format": "CASUAL", "title": "Пятница", "starts_at": "2026-09-25T16:00:00.000Z"})
    assert "Брифинг" not in text
    assert "100 ₽ за игру · максимум 400 ₽ за вечер" in text
