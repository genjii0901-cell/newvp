from __future__ import annotations

import csv
import json
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET


ROOT_DIR = Path.home() / "OneDrive" / "ドキュメント"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "generated-official-wordbooks.json"
NS_MAIN = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
NS_REL = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}


@dataclass(frozen=True)
class BookSpec:
    id: str
    title: str
    patterns: tuple[str, ...]
    required_plan: str
    visibility: str
    level: str
    description: str


BOOK_SPECS: tuple[BookSpec, ...] = (
    BookSpec("gold-phrase", "TOEIC 金のフレーズ", ("TOEIC L & R TEST 出る単特急 金のフレーズ",), "personal", "personal", "TOEIC", "TOEIC学習向けの公式単語帳です。"),
    BookSpec("teppei", "鉄壁 改訂版", ("鉄壁　ぜんぶ", "東大英単語熟語　鉄壁　改訂版　一覧", "鉄壁（改訂版）単語一覧"), "personal", "personal", "難関大", "難関大対策向けの公式単語帳です。"),
    BookSpec("system-tango", "システム英単語 5訂版", ("システム英単語　5訂版　一覧",), "personal", "personal", "大学受験", "大学受験の定番単語帳を使いやすい形で整理した公式単語帳です。"),
    BookSpec("passtan-eiken-2", "英検2級 出る順パス単", ("英検2級　出る順パス単　5訂版　一覧", "英検二級　出る順パス単　5訂版　一覧"), "personal", "personal", "英検2級", "英検2級向けの公式単語帳です。"),
    BookSpec("passtan-eiken-pre1", "英検準1級 出る順パス単", ("出る順パス単　英検準1級　4訂版", "英検準一級独自単語熟語", "eikenn 準一級"), "personal", "personal", "英検準1級", "英検準1級向けの公式単語帳です。"),
    BookSpec("passtan-eiken-1", "英検1級 出る順パス単", ("英検1級　出る順パス単　5訂版",), "teacher", "teacher", "英検1級", "英検1級向けの上級公式単語帳です。"),
    BookSpec("passtan-eiken-pre2", "英検準2級 出る順パス単", ("パス単　準２級　一覧",), "free", "public", "英検準2級", "英検準2級向けの公式単語帳です。"),
    BookSpec("passtan-eiken-3", "英検3級 出る順パス単", ("英検　三級　出る順　パス単",), "free", "public", "英検3級", "英検3級向けの公式単語帳です。"),
    BookSpec("tanjukugo-eiken-1", "英検1級 単熟語EX 第2版", ("英検1級　単熟語EX 第2版",), "teacher", "teacher", "英検1級", "英検1級の単熟語をまとめた公式単語帳です。"),
    BookSpec("tanjukugo-eiken-pre1", "準1級 単熟語EX 第2版", ("準1級　単熟語ex　第2版", "ex2", "ex pre2"), "personal", "personal", "英検準1級", "英検準1級の単熟語をまとめた公式単語帳です。"),
    BookSpec("toefl-3800", "TOEFL 3800", ("toefle3800",), "teacher", "teacher", "TOEFL", "TOEFL対策向けの公式単語帳です。"),
    BookSpec("target-1900", "ターゲット1900", ("ターゲット1900 6訂版　一覧", "ターゲット1900"), "personal", "personal", "大学受験", "ターゲット1900の公式単語帳です。"),
    BookSpec("target-1800", "中学英単語 ターゲット1800", ("中学英単語　ターゲット1800",), "free", "public", "中学英語", "中学英語向けの公式単語帳です。"),
    BookSpec("target-1400", "英単語ターゲット1400", ("英単語ターゲット1400", "英単語　ターゲット1400"), "personal", "personal", "高校英語", "高校英語向けの公式単語帳です。"),
    BookSpec("target-1200", "英単語ターゲット1200", ("英単語 ターゲット1200",), "free", "public", "高校英語", "基礎固め向けの公式単語帳です。"),
    BookSpec("target-jukugo-1000", "英熟語ターゲット1000", ("英熟語ターゲット1000",), "personal", "personal", "熟語", "熟語学習向けの公式単語帳です。"),
    BookSpec("leap", "必携英単語 LEAP", ("必携英単語　LEAP　一覧", "必携英単語LEAP"), "personal", "personal", "大学受験", "LEAPの公式単語帳です。"),
    BookSpec("leap-basic", "必携英単語 LEAP Basic", ("必携英単語　LEAP Basic　一覧",), "free", "public", "基礎英語", "LEAP Basic の公式単語帳です。"),
    BookSpec("duo", "DUO 3.0", ("DUO 3.0　一覧", "DUO3.0"), "personal", "personal", "例文", "例文と一緒に覚えやすい公式単語帳です。"),
    BookSpec("stock-3000", "Stock 3000", ("Stock3000　一覧",), "personal", "personal", "大学受験", "Stock 3000 の公式単語帳です。"),
    BookSpec("stock-4500", "Stock 4500", ("Stock4500　一覧", "stock4500"), "teacher", "teacher", "発展", "発展学習向けの公式単語帳です。"),
    BookSpec("sokutan", "速読英単語 改訂第7版", ("速読英単語【改訂第7版】　一覧", "速単8　必修"), "personal", "personal", "速読英単語", "速読英単語の公式単語帳です。"),
    BookSpec("sokujuku", "速読英熟語", ("速読英熟語",), "personal", "personal", "熟語", "速読英熟語の公式単語帳です。"),
    BookSpec("kaitai-jukugo", "解体英熟語 改訂第2版", ("解体英熟語　改訂第2版", "解体英熟語　改訂第２版　一覧"), "teacher", "teacher", "熟語", "解体英熟語の公式単語帳です。"),
    BookSpec("new-treasure-1", "New Treasure Stage 1", ("new treasure stage1", "newtreasurestage1"), "free", "public", "教科書", "New Treasure Stage 1 の公式単語帳です。"),
    BookSpec("new-treasure-3", "New Treasure Stage 3", ("NT3",), "free", "public", "教科書", "New Treasure Stage 3 の公式単語帳です。"),
    BookSpec("new-horizon", "New Horizon", ("ニューホライゾン", "new horaizon"), "free", "public", "教科書", "New Horizon の公式単語帳です。"),
    BookSpec("original-high-school", "オリジナル 高校入試 英単語", ("オリジナル　高校入試　英単語",), "free", "public", "入試対策", "高校入試対策向けの公式単語帳です。"),
)


def normalize_name(name: str) -> str:
    return name.replace(" ", "").replace("　", "").lower()


def looks_english(text: str) -> bool:
    return bool(re.search(r"[A-Za-z]", text))


def looks_japanese(text: str) -> bool:
    return bool(re.search(r"[\u3040-\u30ff\u3400-\u9fff]", text))


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\u3000", " ")).strip()


def pick_cover(title: str) -> str:
    lower = title.lower()
    if "toeic" in lower:
      return "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=900&q=80"
    if "toefl" in lower:
      return "https://images.unsplash.com/photo-1571260899304-425eee4c7efc?auto=format&fit=crop&w=900&q=80"
    if "鉄壁" in title:
      return "https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=900&q=80"
    if "英検" in title:
      return "https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=900&q=80"
    if "ターゲット" in title or "システム英単語" in title or "LEAP" in title:
      return "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80"
    if "速読" in title or "DUO" in title or "Stock" in title:
      return "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=900&q=80"
    if "Treasure" in title or "Horizon" in title or "中学" in title:
      return "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80"
    return "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=900&q=80"


def excel_column_to_index(ref: str) -> int:
    letters = "".join(ch for ch in ref if ch.isalpha())
    index = 0
    for ch in letters:
        index = index * 26 + (ord(ch.upper()) - 64)
    return max(index - 1, 0)


def iter_xlsx_rows(path: Path) -> list[list[str]]:
    rows: list[list[str]] = []
    with zipfile.ZipFile(path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("m:si", NS_MAIN):
                text = "".join(node.text or "" for node in item.iterfind(".//m:t", NS_MAIN))
                shared_strings.append(text)

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in rels.findall("rel:Relationship", NS_REL)
        }
        first_sheet = workbook.find("m:sheets", NS_MAIN).find("m:sheet", NS_MAIN)
        rel_id = first_sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        target = "xl/" + rel_map[rel_id].lstrip("/")
        worksheet = ET.fromstring(archive.read(target))

        for row in worksheet.findall(".//m:sheetData/m:row", NS_MAIN):
            cells: dict[int, str] = {}
            max_index = -1
            for cell in row.findall("m:c", NS_MAIN):
                ref = cell.attrib.get("r", "")
                index = excel_column_to_index(ref)
                max_index = max(max_index, index)
                cell_type = cell.attrib.get("t")
                value_node = cell.find("m:v", NS_MAIN)
                if cell_type == "s" and value_node is not None and value_node.text is not None:
                    value = shared_strings[int(value_node.text)]
                elif cell_type == "inlineStr":
                    value = "".join(node.text or "" for node in cell.iterfind(".//m:t", NS_MAIN))
                else:
                    value = value_node.text if value_node is not None and value_node.text is not None else ""
                    if not value:
                        value = "".join(node.text or "" for node in cell.iterfind(".//m:t", NS_MAIN))
                cells[index] = clean_text(value)
            rows.append([cells.get(i, "") for i in range(max_index + 1 if max_index >= 0 else 0)])
    return rows


def iter_csv_rows(path: Path) -> list[list[str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        return [[clean_text(cell) for cell in row] for row in reader]


def has_word_header(value: str) -> bool:
    return value in {"単語", "英単語", "word"}


def has_meaning_header(value: str) -> bool:
    return value in {"意味", "日本語", "訳"}


def parse_header_rows(rows: list[list[str]]) -> list[dict[str, object]]:
    for index, row in enumerate(rows[:10]):
        blocks: list[tuple[int, int | None, int]] = []
        for col in range(max(len(row) - 2, 0)):
            if has_word_header(row[col]) and has_meaning_header(row[col + 1]):
                blocks.append((col, None, col + 1))
            if (
                col + 2 < len(row)
                and row[col] in {"番号", "No", "NO", "no"}
                and has_word_header(row[col + 1])
                and has_meaning_header(row[col + 2])
            ):
                blocks.append((col + 1, col, col + 2))
        if not blocks:
            continue

        words: list[dict[str, object]] = []
        running_no = 1
        for data_row in rows[index + 1 :]:
            if not any(data_row):
                continue
            found = False
            for english_col, number_col, japanese_col in blocks:
                english = data_row[english_col] if english_col < len(data_row) else ""
                japanese = data_row[japanese_col] if japanese_col < len(data_row) else ""
                if not english and not japanese:
                    continue
                found = True
                if not english or not japanese:
                    continue
                number_text = data_row[number_col] if number_col is not None and number_col < len(data_row) else ""
                number_match = re.search(r"\d+", number_text or "")
                no = int(number_match.group()) if number_match else running_no
                words.append({"no": no, "english": english, "japanese": japanese, "unit": None})
                running_no = max(running_no + 1, no + 1)
            if not found and words:
                break
        return words
    return []


def parse_vertical_pairs(rows: list[list[str]]) -> list[dict[str, object]]:
    compact_rows = []
    for row in rows:
        cells = [cell for cell in row if cell]
        if not cells:
            continue
        if len(compact_rows) < 2 and any(keyword in cells[0] for keyword in ("一覧", "単語", "意味", "番号")):
            continue
        compact_rows.append(cells)

    words: list[dict[str, object]] = []
    i = 0
    running_no = 1
    while i < len(compact_rows) - 1:
        current = compact_rows[i]
        next_row = compact_rows[i + 1]
        english = current[0]
        japanese = next_row[0]
        if looks_english(english) and japanese and (looks_japanese(japanese) or not looks_english(japanese)):
            no_match = re.search(r"\d+", current[1] if len(current) > 1 else "")
            no = int(no_match.group()) if no_match else running_no
            words.append({"no": no, "english": english, "japanese": japanese, "unit": None})
            running_no = max(running_no + 1, no + 1)
            i += 2
            continue
        i += 1
    return words


def parse_rows(path: Path) -> list[dict[str, object]]:
    try:
        rows = iter_xlsx_rows(path) if path.suffix.lower() == ".xlsx" else iter_csv_rows(path)
    except Exception:
        return []
    candidates = [parse_header_rows(rows), parse_vertical_pairs(rows)]
    best = max(candidates, key=len)
    seen: set[tuple[str, str]] = set()
    unique_words = []
    for word in best:
        key = (str(word["english"]).strip().lower(), str(word["japanese"]).strip())
        if key in seen:
            continue
        seen.add(key)
        unique_words.append(word)
    return unique_words


def candidate_score(spec: BookSpec, path: Path) -> int:
    normalized = normalize_name(path.stem)
    score = 0

    for pattern in spec.patterns:
        pattern_normalized = normalize_name(pattern)
        if normalized == pattern_normalized:
            score += 12
        elif pattern_normalized in normalized:
            score += 8

    if "一覧" in path.name:
        score += 4
    if path.suffix.lower() == ".xlsx":
        score += 2
    if any(token in path.name for token in ("自動回復済み", "コピー", "テスト", "答え", "回復")):
        score -= 3
    if "basic" in normalized and "basic" not in normalize_name(spec.title):
        score -= 4
    if "basic" not in normalized and "basic" in normalize_name(spec.title):
        score -= 2

    return score


def find_candidate_files(spec: BookSpec, files: Iterable[Path]) -> list[Path]:
    matched = []
    for file in files:
        normalized = normalize_name(file.stem)
        if any(normalize_name(pattern) in normalized for pattern in spec.patterns):
            matched.append(file)
    return sorted(matched, key=lambda path: candidate_score(spec, path), reverse=True)


def main() -> None:
    files = [path for path in ROOT_DIR.glob("*.xlsx")] + [path for path in ROOT_DIR.glob("*.csv")]
    books = []

    for spec in BOOK_SPECS:
        candidate = None
        words: list[dict[str, object]] = []
        for next_candidate in find_candidate_files(spec, files):
            next_words = parse_rows(next_candidate)
            if len(next_words) >= 5:
                candidate = next_candidate
                words = next_words
                break
        if candidate is None or len(words) < 5:
            continue
        books.append(
            {
                "id": spec.id,
                "title": spec.title,
                "description": spec.description,
                "coverImage": pick_cover(spec.title),
                "requiredPlan": spec.required_plan,
                "visibility": spec.visibility,
                "level": spec.level,
                "words": words,
            }
        )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(books, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {len(books)} books to {OUTPUT_PATH}")
    for book in books:
        print(f"- {book['title']}: {len(book['words'])} words")


if __name__ == "__main__":
    main()
