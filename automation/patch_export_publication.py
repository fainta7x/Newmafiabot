from pathlib import Path
import subprocess

BASE_PATCH_BLOB = 'a94ff5041fd9004d9297deba408b78a514f504df'
source = subprocess.check_output(['git', 'cat-file', 'blob', BASE_PATCH_BLOB], text=True)
exec(compile(source, f'git-blob:{BASE_PATCH_BLOB}', 'exec'), globals(), globals())

test_path = Path('src/tests/resultExportPublication.test.ts')
test_text = test_path.read_text(encoding='utf-8')
old = "    expect(longSvg).toContain('ПРИ ПОЛНОМ РАВЕНСТВЕ · ЛИЧНЫЕ ВСТРЕЧИ');"
new = "    expect(longSvg).toContain('ПРИ ПОЛНОМ РАВЕНСТВЕ ·');\n    expect(longSvg).toContain('ЛИЧНЫЕ ВСТРЕЧИ 2:1');"
if test_text.count(old) != 1:
    raise SystemExit(f'wrapped head-to-head assertion: expected 1 match, found {test_text.count(old)}')
test_path.write_text(test_text.replace(old, new, 1), encoding='utf-8')
print('patched wrapped head-to-head assertion')
