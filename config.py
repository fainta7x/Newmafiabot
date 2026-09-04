import os
from dotenv import load_dotenv

load_dotenv()

# Telegram bot token is supplied only through the environment.
TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')

# ADMIN_IDS from env or fallback
ADMIN_IDS_RAW = os.getenv('ADMIN_IDS', '806709593,595795530,1576242455')
ADMIN_IDS = [int(x.strip()) for x in ADMIN_IDS_RAW.split(',') if x.strip().isdigit()]

BACKUP_ADMIN_ID = int(os.getenv('BACKUP_ADMIN_ID', '1576242455'))
ORGANIZER_NOTIFICATION_IDS_RAW = (
    os.getenv('ORGANIZER_NOTIFICATION_IDS', '').strip()
    or os.getenv('ORGANIZER_CHAT_ID', '').strip()
    or str(BACKUP_ADMIN_ID)
)
ORGANIZER_NOTIFICATION_IDS = [
    int(x.strip()) for x in ORGANIZER_NOTIFICATION_IDS_RAW.split(',') if x.strip().lstrip('-').isdigit()
]
ORGANIZER_NOTIFICATION_INTERVAL_MINUTES = int(os.getenv('ORGANIZER_NOTIFICATION_INTERVAL_MINUTES', '30'))
PHONE = os.getenv('ORGANIZER_PHONE', '')
BANK = os.getenv('ORGANIZER_BANK', 'Сбербанк')

TEST_GROUP_ID = int(os.getenv('TEST_GROUP_ID', '-1001628595679'))
GROUP_ID = TEST_GROUP_ID
ANNOUNCE_TOPIC_ID = int(os.getenv('ANNOUNCE_TOPIC_ID', '5912'))

USE_WEBHOOK = os.getenv('USE_WEBHOOK', 'False').lower() in ('true', '1', 't')
WEBHOOK_URL = os.getenv('WEBHOOK_URL', '')

# Bot API Configuration
BOT_API_BASE_URL = os.getenv('BOT_API_BASE_URL', 'http://127.0.0.1:3000')
BOT_API_SECRET = os.getenv('BOT_API_SECRET', '')

# Player Mini App origin must stay public even in the combined container where
# BOT_API_BASE_URL is the internal Node address.
CANONICAL_PLAYER_APP_URL = 'https://2la-noire-chagina7x.waw0.amvera.tech'
PLAYER_APP_URL = (os.getenv('PLAYER_APP_URL', '').strip() or WEBHOOK_URL.strip() or CANONICAL_PLAYER_APP_URL).rstrip('/')
if PLAYER_APP_URL.endswith('/webhook'):
    PLAYER_APP_URL = PLAYER_APP_URL[:-len('/webhook')]
