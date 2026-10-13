import config
from aiogram.types import BotCommand, BotCommandScopeChat


async def setup_bot_commands(bot):
    """Keep Telegram's command menu focused on the unified player product."""
    # Players see only what they use. «/cabinet» and «/app» both open the same app, so one entry is enough;
    # the organizer's commands are set for the organizers' chats only (owner, 2026-10-13: «чистка бота»).
    commands = [
        BotCommand(command="start", description="Меню клуба"),
        BotCommand(command="events", description="Ближайшие вечера и запись"),
        BotCommand(command="faq", description="Частые вопросы"),
        BotCommand(command="app", description="Открыть приложение"),
        BotCommand(command="link", description="Ссылка для браузера"),
    ]
    await bot.set_my_commands(commands)
    staff_commands = [*commands, BotCommand(command="crm", description="Кабинет организатора"), BotCommand(command="status", description="Состояние приложения")]
    for admin_id in sorted(config.ADMIN_IDS):
        try:
            await bot.set_my_commands(staff_commands, scope=BotCommandScopeChat(chat_id=admin_id))
        except Exception as exc:  # the organizer may not have opened the bot yet
            print(f"⚠️ Команды организатора {admin_id} не установлены: {exc}")
    print(f"✅ Установлено команд: {len(commands)}")
    # What a newcomer sees before pressing «Start» and in the bot's profile.
    try:
        await bot.set_my_description(
            "🎭 2LA Noire — клуб классической мафии в Туле.\n\n"
            "Здесь можно записаться на вечер, узнать, где и во сколько играем, сколько стоит, "
            "и получить ответы на частые вопросы. Новичкам рады — правила объясним с нуля.\n\n"
            "Нажми «Старт» 👇"
        )
        await bot.set_my_short_description("Клуб классической мафии в Туле: запись на вечера, правила и тренажёры.")
    except Exception as exc:  # the description is cosmetic; startup must not fail on it
        print(f"⚠️ Не удалось обновить описание бота: {exc}")
