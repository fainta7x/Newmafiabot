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

    # The slot plan counts «иду/позже» without a plan in every game (Вика, Даня); they must be listed separately.
    slots = [{"slot_number": 1, "starts_at": "2026-09-25T16:00:00Z", "registered_count": 4,
              "participants": [{"id": "a", "nickname": "Аня"}, {"id": "b", "nickname": "Борис"},
                               {"id": "c", "nickname": "Вика"}, {"id": "e", "nickname": "Даня"}]}]
    participants = [
        {"player_id": "a", "nickname": "Аня", "response_status": "going", "selected_games": 1},
        {"player_id": "b", "nickname": "Борис", "response_status": "late", "selected_games": 1},
        {"player_id": "c", "nickname": "Вика", "response_status": "going", "selected_games": 0},
        {"player_id": "d", "nickname": "Гоша", "response_status": "thinking", "selected_games": 0},
        {"player_id": "e", "nickname": "Даня", "response_status": "late", "selected_games": 0},
        {"player_id": "f", "nickname": "Ева", "response_status": "declined", "selected_games": 0},
    ]
    text = thematic_event_text({"format": "CASUAL", "title": "Пятница", "starts_at": "2026-09-25T16:00:00Z"}, slots, participants)
    assert "игра 1 — <b>4</b> игрока" in text
    assert "Записались на игры: 2" in text
    assert "Идут на весь вечер, игры не выбрали (1)</b>: Вика" in text
    assert "Придут позже, игры не выбрали (1)</b>: Даня" in text
    assert "Пока думают (1)</b>: Гоша" in text
    assert "Не смогут: 1" in text
    assert text.count("Вика") == 1 and text.count("Даня") == 1


def test_group_post_stays_within_telegram_limit():
    from handlers.telegram_evening_copy import thematic_event_text

    people = [{"player_id": str(i), "nickname": "Очень-длинный-ник-игрока-" + "x" * 30 + str(i),
               "response_status": ("going", "late", "thinking")[i % 3], "selected_games": 0} for i in range(150)]
    slots = [{"slot_number": n, "starts_at": "2026-09-25T16:00:00Z", "registered_count": 11,
              "participants": [{"id": f"s{n}-{k}", "nickname": "Игрок-" + "y" * 40 + str(k)} for k in range(11)]} for n in range(1, 7)]
    text = thematic_event_text({"format": "CASUAL", "title": "Пятница", "starts_at": "2026-09-25T16:00:00Z"}, slots, people)
    assert len(text) <= 4000
    assert "Пока думают (50)" in text
