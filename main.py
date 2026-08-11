import asyncio
import datetime
import hmac
import logging
import os

from aiogram import BaseMiddleware, Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import FSInputFile, Update
from aiohttp import web

import admin
import config
import database as db
from commands import setup_bot_commands
from database import init_db
from game import router as game_router  # игровой роутер
from handlers import achievements
from handlers import admin_crm
from handlers import admin_judges
from handlers import booking
from handlers import crm_booking
from handlers import crm_evening_response
from handlers import payment
from handlers import profile
from handlers import registration
from handlers import shop
from handlers import start_profile
from handlers.crm_evening_announcement import send_crm_evening_announcement
from handlers.crm_group_announcement import send_crm_group_announcement
from handlers.crm_telegram_publishing import (
    sync_evening_telegram,
    sync_public_router,
    test_telegram_destination,
)


class MyLoggerMiddleware(BaseMiddleware):
    async def __call__(self, handler, event: Update, data):
        if event.message:
            user = event.message.from_user
            print(
                f"📩 СООБЩЕНИЕ | {user.full_name} (@{user.username}) "
                f"| ID: {user.id} | Текст: {event.message.text}"
            )
        elif event.callback_query:
            user = event.callback_query.from_user
            print(
                f"🔘 КНОПКА | {user.full_name} (@{user.username}) "
                f"| Нажал: {event.callback_query.data}"
            )
        return await handler(event, data)


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

bot = None
dp = None


async def on_startup():
    global bot, dp

    await init_db()
    logger.info("✅ БД инициализирована")

    await bot.delete_webhook(drop_pending_updates=True)

    await setup_bot_commands(bot)
    logger.info("✅ Команды для меню установлены!")

    webhook_url = f"{config.WEBHOOK_URL}/webhook"
    await bot.set_webhook(webhook_url, allowed_updates=["message", "callback_query"])
    logger.info(f"✅ Вебхук установлен: {webhook_url}")


async def on_shutdown():
    global bot
    await bot.delete_webhook()
    await bot.session.close()
    logger.info("✅ Бот остановлен")


async def handle_webhook(request):
    global dp, bot

    try:
        update_data = await request.json()
        update = Update(**update_data)
        await dp.feed_update(bot, update)
        return web.Response(status=200)
    except Exception as e:
        logger.error(f"Ошибка обработки вебхука: {e}", exc_info=True)
        return web.Response(status=200)


def _crm_request_authorized(request: web.Request) -> bool:
    expected = str(config.BOT_API_SECRET or "")
    provided = str(request.headers.get("X-Bot-Token") or "")
    return bool(expected and provided and hmac.compare_digest(expected, provided))


def _announcement_result_response(result: dict):
    if result.get("success"):
        return web.json_response(result)
    if result.get("error") == "closed":
        return web.json_response(result, status=409)
    if result.get("error") in {"not_found", "evening_unavailable", "destination_not_found"}:
        return web.json_response(result, status=404)
    if result.get("error") in {"chat_id_missing", "invalid"}:
        return web.json_response(result, status=400)
    return web.json_response(result, status=502)


async def handle_crm_group_announcement_request(request: web.Request):
    global bot
    if not _crm_request_authorized(request):
        return web.json_response({"error": "unauthorized"}, status=401)
    if bot is None:
        return web.json_response({"error": "bot_not_ready"}, status=503)

    evening_id = str(request.match_info.get("evening_id") or "").strip()
    if not evening_id:
        return web.json_response({"error": "evening_id_required"}, status=400)

    return _announcement_result_response(await send_crm_group_announcement(bot, evening_id))


async def handle_crm_evening_announcement_request(request: web.Request):
    global bot
    if not _crm_request_authorized(request):
        return web.json_response({"error": "unauthorized"}, status=401)
    if bot is None:
        return web.json_response({"error": "bot_not_ready"}, status=503)

    evening_id = str(request.match_info.get("evening_id") or "").strip()
    if not evening_id:
        return web.json_response({"error": "evening_id_required"}, status=400)

    return _announcement_result_response(await send_crm_evening_announcement(bot, evening_id))


async def handle_crm_telegram_sync_request(request: web.Request):
    global bot
    if not _crm_request_authorized(request):
        return web.json_response({"error": "unauthorized"}, status=401)
    if bot is None:
        return web.json_response({"error": "bot_not_ready"}, status=503)

    evening_id = str(request.match_info.get("evening_id") or "").strip()
    if not evening_id:
        return web.json_response({"error": "evening_id_required"}, status=400)
    return _announcement_result_response(await sync_evening_telegram(bot, evening_id))


async def handle_crm_public_router_sync_request(request: web.Request):
    global bot
    if not _crm_request_authorized(request):
        return web.json_response({"error": "unauthorized"}, status=401)
    if bot is None:
        return web.json_response({"error": "bot_not_ready"}, status=503)
    return _announcement_result_response(await sync_public_router(bot))


async def handle_crm_telegram_test_request(request: web.Request):
    global bot
    if not _crm_request_authorized(request):
        return web.json_response({"error": "unauthorized"}, status=401)
    if bot is None:
        return web.json_response({"error": "bot_not_ready"}, status=503)
    destination_id = str(request.match_info.get("destination_id") or "").strip()
    if not destination_id:
        return web.json_response({"error": "destination_id_required"}, status=400)
    return _announcement_result_response(await test_telegram_destination(bot, destination_id))


def setup_handlers():
    """Регистрация всех хендлеров и роутеров"""
    global dp, bot

    # Логгер (перехватывает все апдейты)
    dp.update.outer_middleware(MyLoggerMiddleware())

    # Передаём bot в модули, где он нужен
    payment.setup_payment_handlers(bot)
    admin.setup_admin_handlers(bot)

    # ========== РЕГИСТРАЦИЯ РОУТЕРОВ (ВАЖНЫЙ ПОРЯДОК!) ==========

    # 1. Сначала самые специфичные хендлеры с фильтрами
    dp.include_router(admin_judges.router)  # управление судьями
    dp.include_router(admin_crm.router)  # новая CRM-панель организатора
    dp.include_router(admin.router)  # legacy админ-панель (/admin)

    # 2. Пользовательские хендлеры. Canonical registration must see /start first.
    dp.include_router(registration.router)  # /start + новая CRM-регистрация
    dp.include_router(start_profile.router)  # legacy профиль и остальные команды
    dp.include_router(profile.router)  # профиль
    dp.include_router(payment.router)  # оплата
    dp.include_router(crm_evening_response.router)  # CRM-ответы на анонс вечера
    dp.include_router(crm_booking.router)  # CRM-запись и список игроков
    dp.include_router(booking.router)  # legacy запись на игру (fallback)

    # 3. Игровые роутеры
    dp.include_router(game_router)  # игровая логика

    # 5. Ачивки
    dp.include_router(achievements.router)

    # 6. Магазин
    dp.include_router(shop.router)


# Автоматические бэкапы в 3:00
async def daily_backup_task():
    """Фоновая задача для ежедневного бэкапа в 3:00"""
    global bot

    while True:
        now = datetime.datetime.now()
        next_backup = now.replace(hour=3, minute=0, second=0, microsecond=0)
        if now >= next_backup:
            next_backup += datetime.timedelta(days=1)

        wait_seconds = (next_backup - now).total_seconds()
        logger.info(f"⏰ Следующий бэкап через {wait_seconds/3600:.1f} часов")
        await asyncio.sleep(wait_seconds)

        if bot is None:
            logger.error("❌ Бот не инициализирован, бэкап не создан")
            continue

        backup_path = await db.create_backup_file()

        if backup_path:
            try:
                await bot.send_document(
                    config.BACKUP_ADMIN_ID,
                    FSInputFile(backup_path),
                    caption="📁 **Ежедневный бэкап**\n\n"
                            f"📅 Дата: {datetime.datetime.now().strftime('%d.%m.%Y %H:%M:%S')}",
                    parse_mode="Markdown"
                )
                logger.info(f"✅ Бэкап отправлен админу {config.BACKUP_ADMIN_ID}")
            except Exception as e:
                logger.error(f"❌ Ошибка отправки бэкапа: {e}")
            finally:
                await db.delete_temp_file(backup_path)


async def public_router_refresh_task():
    """Keep the public entry message current even when no organizer action happens."""
    global bot
    await asyncio.sleep(20)
    while True:
        if bot is not None:
            try:
                result = await sync_public_router(bot)
                if not result.get("success"):
                    logger.warning("⚠️ Не удалось обновить публичный Telegram-маршрутизатор: %s", result.get("error"))
            except Exception as exc:
                logger.warning("⚠️ Ошибка фонового обновления Telegram-маршрутизатора: %s", exc)
        await asyncio.sleep(60 * 30)


# Старт вебхуков для сервера
async def start_webhook():
    global bot, dp
    storage = MemoryStorage()
    bot = Bot(token=config.TOKEN)
    dp = Dispatcher(storage=storage)

    setup_handlers()

    # Проверка связи с бэкендом
    try:
        from bot_api import check_backend_connection
        res = await check_backend_connection()
    except Exception as e:
        res = {"success": False, "message": str(e)}

    if res.get("success"):
        logger.info(f"🔌 [Backend API] Связь с бэкендом успешно установлена! Service: {res.get('service')}, API Version: {res.get('api_version')}")
    else:
        logger.warning(f"⚠️ [Backend API] Не удалось установить связь с бэкендом: {res.get('message')}. Бот продолжает работу в автономном режиме.")

    asyncio.create_task(daily_backup_task())
    asyncio.create_task(public_router_refresh_task())
    logger.info("✅ Задача ежедневного бэкапа запущена")
    logger.info("✅ Автообновление публичного Telegram-маршрутизатора запущено")

    app = web.Application()
    app.router.add_post("/webhook", handle_webhook)
    app.router.add_post("/crm/evenings/{evening_id}/announce", handle_crm_evening_announcement_request)
    app.router.add_post("/crm/evenings/{evening_id}/announce-group", handle_crm_group_announcement_request)
    app.router.add_post("/crm/evenings/{evening_id}/sync-telegram", handle_crm_telegram_sync_request)
    app.router.add_post("/crm/telegram/sync-public", handle_crm_public_router_sync_request)
    app.router.add_post("/crm/telegram/test/{destination_id}", handle_crm_telegram_test_request)
    app.router.add_get("/health", lambda request: web.Response(text="OK"))
    app.on_startup.append(lambda _: on_startup())
    app.on_shutdown.append(lambda _: on_shutdown())

    port = int(os.environ.get("PORT", 8080))
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host="0.0.0.0", port=port)
    await site.start()

    logger.info(f"🚀 Бот запущен на порту {port} в режиме webhook")
    logger.info(f"📍 Вебхук URL: {config.WEBHOOK_URL}/webhook")
    await asyncio.Event().wait()


async def start_polling():  # запуск в режиме polling (для локальной разработки)
    global bot, dp
    storage = MemoryStorage()
    bot = Bot(token=config.TOKEN)
    dp = Dispatcher(storage=storage)
    setup_handlers()

    # Проверка связи с бэкендом
    try:
        from bot_api import check_backend_connection
        res = await check_backend_connection()
    except Exception as e:
        res = {"success": False, "message": str(e)}

    if res.get("success"):
        logger.info(f"🔌 [Backend API] Связь с бэкендом успешно установлена! Service: {res.get('service')}, API Version: {res.get('api_version')}")
    else:
        logger.warning(f"⚠️ [Backend API] Не удалось установить связь с бэкендом: {res.get('message')}. Бот продолжает работу в автономном режиме.")

    await init_db()
    logger.info("✅ БД инициализирована")
    await bot.delete_webhook(drop_pending_updates=True)
    asyncio.create_task(public_router_refresh_task())

    logger.info("🚀 Бот запущен в режиме polling (локально)")
    await dp.start_polling(bot)


if __name__ == "__main__":
    try:
        USE_WEBHOOK = os.environ.get("USE_WEBHOOK", "False").lower() == "true"

        if USE_WEBHOOK:
            asyncio.run(start_webhook())
        else:
            asyncio.run(start_polling())

    except KeyboardInterrupt:
        print("❌ Бот выключен")
