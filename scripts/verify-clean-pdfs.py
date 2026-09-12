import json
import re
import sys
from pathlib import Path
from pypdf import PdfReader

root = Path(sys.argv[1])
errors = []
checked = 0
pages = 0
for path in sorted(root.glob('*/*.pdf')):
    try:
        reader = PdfReader(path)
        if not reader.is_encrypted:
            raise ValueError('PDF is not encrypted')
        if not reader.decrypt(''):
            raise ValueError('Cannot open without a viewing password')
        count = len(reader.pages)
        if not count or ('__sample' in path.name and count != 1):
            raise ValueError(f'Unexpected page count: {count}')
        permissions = int(reader.trailer['/Encrypt']['/P'])
        if permissions & 16 or permissions & 8:
            raise ValueError('Copy or modify permission is enabled')
        # Date and personal-information labels live outside the vocabulary table.
        for index in {0, count - 1}:
            page = reader.pages[index]
            text = page.extract_text()
            if not text.strip() or 'Created by Vocab Print Pro' not in text:
                raise ValueError(f'Empty or incomplete page {index + 1}')
            if re.search(r'(?m)^\s*\d{4}/\d{1,2}/\d{1,2}\s*$', text):
                raise ValueError(f'Date remains on page {index + 1}')
            if re.search(r'(?m)^\s*氏名\s*$', text):
                raise ValueError(f'Name field remains on page {index + 1}')
        checked += 1
        pages += count
    except Exception as error:
        errors.append({'file': str(path), 'error': str(error)})
    if (checked + len(errors)) % 100 == 0:
        print(f'Checked {checked} PDFs; errors {len(errors)}', flush=True)
report = {'checked': checked, 'pages': pages, 'errors': errors}
(root.parent / 'pdf-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False), flush=True)
sys.exit(bool(errors))
