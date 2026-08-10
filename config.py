import os
from dotenv import load_dotenv

load_dotenv()

#TOKEN mafiabot_test для тестирования
#TOKEN = '8791874608:AAHhR0Z36CAOEN_aLvQ-PXM20btxmxL25a0' 

# TOKEN mafiabot read from environment
TOKEN = os.getenv('8791874608:AAHhR0Z36CAOEN_aLvQ-PXM20btxmxL25a0', '')

# ADMIN_IDS from env or fallback
ADMIN_IDS_RAW = os.getenv('ADMIN_IDS', '806709593,595795530,1576242455')
ADMIN_IDS = [int(x.strip()) for x in ADMIN_IDS_RAW.split(',') if x.strip().isdigit()]

BACKUP_ADMIN_ID = int(os.getenv('BACKUP_ADMIN_ID', '1576242455'))
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

