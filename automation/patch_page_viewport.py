from pathlib import Path

p = Path('src/lib/tournamentResultsExport.ts')
s = p.read_text(encoding='utf-8')

old_vars = "const clipId = `page-clip-${pageNumber}`;\n  const translatedY = contentTop - descriptor.start;"
new_vars = "const sourceHeight = descriptor.end - descriptor.start;"
if s.count(old_vars) != 1:
    raise SystemExit(f'viewport vars match={s.count(old_vars)}')
s = s.replace(old_vars, new_vars, 1)

old_markup = "<defs><clipPath id=\"${clipId}\"><rect x=\"0\" y=\"${contentTop}\" width=\"${EXPORT_PAGE_WIDTH}\" height=\"${contentHeight}\"/></clipPath></defs>\n      <g clip-path=\"url(#${clipId})\" transform=\"translate(0 ${translatedY})\">${inner}</g>"
new_markup = "<svg x=\"0\" y=\"${contentTop}\" width=\"${EXPORT_PAGE_WIDTH}\" height=\"${sourceHeight}\" viewBox=\"0 ${descriptor.start} ${EXPORT_PAGE_WIDTH} ${sourceHeight}\" preserveAspectRatio=\"xMinYMin meet\" overflow=\"hidden\">${inner}</svg>"
if s.count(old_markup) != 1:
    raise SystemExit(f'viewport markup match={s.count(old_markup)}')
s = s.replace(old_markup, new_markup, 1)

p.write_text(s, encoding='utf-8')
print('semantic page viewport patched')
