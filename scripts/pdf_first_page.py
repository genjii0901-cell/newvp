#!/usr/bin/env python3
"""Extract and inspect the first page of a PDF for the note artifact pipeline."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from pypdf import PdfReader, PdfWriter


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_pdf", type=Path)
    parser.add_argument("sample_pdf", type=Path)
    args = parser.parse_args()

    reader = PdfReader(str(args.input_pdf))
    if not reader.pages:
        raise ValueError(f"PDF has no pages: {args.input_pdf}")

    args.sample_pdf.parent.mkdir(parents=True, exist_ok=True)
    writer = PdfWriter()
    writer.add_page(reader.pages[0])
    if reader.metadata:
        writer.add_metadata(
            {
                key: str(value)
                for key, value in reader.metadata.items()
                if key and value is not None
            }
        )
    with args.sample_pdf.open("wb") as file_handle:
        writer.write(file_handle)

    sample_reader = PdfReader(str(args.sample_pdf))
    first_page = reader.pages[0]
    box = first_page.mediabox
    result = {
        "fullPages": len(reader.pages),
        "samplePages": len(sample_reader.pages),
        "widthPoints": float(box.width),
        "heightPoints": float(box.height),
        "firstPageText": first_page.extract_text() or "",
    }
    # Keep stdout ASCII-safe on Windows terminals configured for CP932.
    print(json.dumps(result, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
