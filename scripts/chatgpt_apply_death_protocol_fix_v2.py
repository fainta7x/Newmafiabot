from pathlib import Path
import runpy

runpy.run_path('scripts/chatgpt_apply_death_protocol_fix.py', run_name='__main__')

path = Path('src/tests/liveDeathProtocolBridge.test.tsx')
text = path.read_text(encoding='utf-8')
old = "import React from 'react';\n"
if text.count(old) != 1:
    raise RuntimeError(f'expected one unused React import, found {text.count(old)}')
path.write_text(text.replace(old, '', 1), encoding='utf-8')
print('Verification harness corrected')
