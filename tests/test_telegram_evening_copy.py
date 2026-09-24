from handlers.telegram_evening_copy import event_base_text


def test_novice_announcement_shows_briefing_and_free_first_evenings():
    text = event_base_text({"format": "NOVICE", "title": "Школа", "starts_at": "2026-09-25T16:00:00.000Z", "default_price": 200})
    assert "🎓 Брифинг для новичков — 18:30, первая игра — 19:00" in text
    assert "Первые 2 вечера — бесплатно, дальше 200 ₽ за игру" in text


def test_casual_announcement_has_no_briefing():
    text = event_base_text({"format": "CASUAL", "title": "Пятница", "starts_at": "2026-09-25T16:00:00.000Z"})
    assert "Брифинг" not in text
    assert "100 ₽ за игру · максимум 400 ₽ за вечер" in text


def test_group_post_lists_players_who_answered_but_have_no_games():
    from handlers.telegram_evening_copy import thematic_event_text

    slots = [{"slot_number": 1, "starts_at": "2026-09-25T16:00:00Z", "registered_count": 2,
              "participants": [{"id": "a", "nickname": "Аня"}, {"id": "b", "nickname": "Борис"}]}]
    participants = [
        {"player_id": "a", "nickname": "Аня", "response_status": "going"},
        {"player_id": "c", "nickname": "Вика", "response_status": "going"},
        {"player_id": "d", "nickname": "Гоша", "response_status": "thinking"},
        {"player_id": "e", "nickname": "Даня", "response_status": "late"},
        {"player_id": "f", "nickname": "Ева", "response_status": "declined"},
    ]
    text = thematic_event_text({"format": "CASUAL", "title": "Пятница", "starts_at": "2026-09-25T16:00:00Z"}, slots, participants)
    assert "игра 1 — <b>2</b> игрока" in text
    assert "Идут, игры ещё не выбрали (1):</b> Вика" in text
    assert "Придут позже (1):</b> Даня" in text
    assert "Пока думают (1):</b> Гоша" in text
    assert "Не смогут: 1" in text
    assert "Аня" in text and text.count("Аня") == 1
