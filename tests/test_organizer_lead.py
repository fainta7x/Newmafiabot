from handlers.organizer_lead import parse_lead


def test_parses_name_and_telegram_nick():
    assert parse_lead("Иван @ivan_tg") == ("Иван", "@ivan_tg")


def test_parses_name_after_contact_and_vk_link():
    assert parse_lead("vk.com/anna_k Анна") == ("Анна", "vk.com/anna_k")
    assert parse_lead("Анна Петрова, https://vk.com/anna.p") == ("Анна Петрова", "https://vk.com/anna.p")


def test_parses_phone_with_spaces():
    assert parse_lead("Пётр +7 900 123-45-67") == ("Пётр", "+7 900 123-45-67")


def test_needs_both_a_name_and_a_contact():
    assert parse_lead("Иван") is None
    assert parse_lead("@ivan_tg") is None
    assert parse_lead("") is None
