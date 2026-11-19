"""The business's product list, imported from an Excel (.xlsx) or CSV file on the Files page.

One list per business. The AI assistant answers from it (when switched on for that assistant)
and a flow's "Add to cart" step can take its prices from it, so products are entered once.

Reading .xlsx needs no extra package: the file is a zip of XML parts (the first sheet and the
shared strings are all we need).
"""

import csv
import io
import json
import re
import zipfile
from xml.etree import ElementTree as ET

MAX_BYTES = 2 * 1024 * 1024
MAX_PRODUCTS = 500
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

# Header names we recognise (lower-case, ₹ and brackets removed).
CODE_NAMES = {"code", "product code", "item code", "sku", "id", "product id"}
NAME_NAMES = {"name", "product", "product name", "item", "item name", "title"}
PRICE_NAMES = {"price", "mrp", "rate", "amount", "selling price", "price rs", "price inr", "cost", "sale price"}
# A status column from the business's own website. "Hidden" kinds take the product off the list;
# "availability" kinds keep it but mark it out of stock, so the assistant says so instead of selling it.
HIDE_NAMES = {"status", "active", "visible", "published", "enabled", "is active", "is visible"}
AVAILABILITY_NAMES = {"available", "availability", "in stock", "stock status", "is available"}
HIDDEN_VALUES = {"inactive", "hidden", "draft", "disabled", "archived", "deleted", "no", "false", "0", "off", "unpublished", "discontinued", "private"}
OUT_VALUES = {"out of stock", "sold out", "out_of_stock", "outofstock", "unavailable", "no", "false", "0", "n"}


class CatalogError(Exception):
    pass


def _col_index(ref: str) -> int:
    """'C7' → 2."""
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):  # type: ignore[union-attr]
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def read_xlsx(data: bytes) -> list[list[str]]:
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise CatalogError("This isn't a valid .xlsx file") from exc
    names = set(z.namelist())
    shared: list[str] = []
    if "xl/sharedStrings.xml" in names:
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
    # The first sheet in the workbook's order.
    sheet = "xl/worksheets/sheet1.xml"
    try:
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        first = wb.find("m:sheets/m:sheet", NS)
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        if first is not None:
            rid = first.get(REL_NS)
            for r in rels:
                if r.get("Id") == rid:
                    target = r.get("Target", "").lstrip("/")
                    sheet = target if target.startswith("xl/") else f"xl/{target}"
    except (KeyError, ET.ParseError):
        pass
    if sheet not in names:
        raise CatalogError("The workbook has no sheet")
    rows: list[list[str]] = []
    for row in ET.fromstring(z.read(sheet)).iter(f"{{{NS['m']}}}row"):
        cells: dict[int, str] = {}
        for c in row.findall("m:c", NS):
            kind = c.get("t")
            if kind == "inlineStr":
                value = "".join(t.text or "" for t in c.iter(f"{{{NS['m']}}}t"))
            else:
                v = c.find("m:v", NS)
                value = v.text if v is not None and v.text is not None else ""
                if kind == "s" and value.isdigit() and int(value) < len(shared):
                    value = shared[int(value)]
            cells[_col_index(c.get("r", "A1"))] = value.strip()
        if cells:
            rows.append([cells.get(i, "") for i in range(max(cells) + 1)])
        if len(rows) > MAX_PRODUCTS + 1:
            break
    return rows


def read_csv(data: bytes) -> list[list[str]]:
    text = data.decode("utf-8-sig", errors="replace")
    try:
        dialect = csv.Sniffer().sniff(text[:2048], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel  # one column, or nothing to guess from
    return [[c.strip() for c in r] for r in csv.reader(io.StringIO(text), dialect)][: MAX_PRODUCTS + 1]


def _key(header: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[₹()\[\].:]", " ", header.lower())).strip()


def _price(text: str) -> float | None:
    raw = re.sub(r"[^\d.]", "", text.replace(",", ""))
    try:
        value = round(float(raw), 2)
    except ValueError:
        return None
    return value if value > 0 else None


def to_products(rows: list[list[str]]) -> tuple[list[dict], list[str], list[int]]:
    """(products, extra column names, spreadsheet row numbers that were skipped)."""
    rows = [r for r in rows if any(c.strip() for c in r)]
    if not rows:
        raise CatalogError("The file is empty")
    header = [_key(h) for h in rows[0]]
    find = lambda wanted: next((i for i, h in enumerate(header) if h in wanted), None)
    code_i, name_i, price_i = find(CODE_NAMES), find(NAME_NAMES), find(PRICE_NAMES)
    hide_i, avail_i = find(HIDE_NAMES), find(AVAILABILITY_NAMES)
    missing = [n for n, i in (("Code", code_i), ("Name", name_i), ("Price", price_i)) if i is None]
    if missing:
        raise CatalogError(f"The first row needs the column{'s' if len(missing) > 1 else ''} {', '.join(missing)}")
    extra = [(i, rows[0][i].strip()) for i in range(len(rows[0])) if i not in (code_i, name_i, price_i, hide_i, avail_i) and rows[0][i].strip()]

    products: list[dict] = []
    skipped: list[int] = []
    seen: set[str] = set()
    for n, r in enumerate(rows[1:], start=2):
        cell = lambda i: r[i].strip() if i is not None and i < len(r) else ""
        code, name, price = cell(code_i), cell(name_i), _price(cell(price_i))
        squashed = re.sub(r"\s+", "", code.lower())
        if not code or not name or price is None or squashed in seen:
            skipped.append(n)
            continue
        status = cell(hide_i).lower()
        if status in HIDDEN_VALUES:
            continue  # switched off on the website: not on the list (not an error)
        seen.add(squashed)
        details = {label[:40]: cell(i)[:200] for i, label in extra if cell(i)}
        if status in OUT_VALUES or cell(avail_i).lower() in OUT_VALUES:
            details["Stock"] = "0"
        products.append({"code": code[:20], "name": name[:80], "price": price, "details": details})
        if len(products) >= MAX_PRODUCTS:
            break
    if not products:
        raise CatalogError("No product rows could be read (each needs a code, a name and a price above 0)")
    return products, [label for _, label in extra], skipped


def read_json(data: bytes | list | dict) -> list[list[str]]:
    """A JSON list of products (or {"products": [...]}) as rows: a header of every field, then values."""
    if isinstance(data, (bytes, str)):
        try:
            data = json.loads(data)
        except ValueError as exc:
            raise CatalogError("This isn't valid JSON") from exc
    if isinstance(data, dict):
        data = next((data[k] for k in ("products", "items", "data") if isinstance(data.get(k), list)), None)
    if not isinstance(data, list):
        raise CatalogError("The JSON must be a list of products")
    items = [d for d in data if isinstance(d, dict)][:MAX_PRODUCTS]
    header: list[str] = []
    for d in items:
        for k, v in d.items():
            if k not in header and (v is None or isinstance(v, (str, int, float, bool))):
                header.append(str(k))
    text = lambda v: "" if v is None else ("true" if v is True else "false" if v is False else str(v))
    return [header] + [[text(d.get(k)) for k in header] for d in items]


def parse_file(file_name: str, data: bytes) -> tuple[list[dict], list[str], list[int]]:
    if len(data) > MAX_BYTES:
        raise CatalogError("The file is larger than 2 MB")
    lower = file_name.lower()
    if lower.endswith(".xlsx"):
        rows = read_xlsx(data)
    elif lower.endswith(".csv"):
        rows = read_csv(data)
    elif lower.endswith(".json"):
        rows = read_json(data)
    elif lower.endswith(".xls"):
        raise CatalogError("Old .xls files can't be read; save it as .xlsx or .csv")
    else:
        raise CatalogError("Use an Excel (.xlsx), CSV or JSON file")
    return to_products(rows)


def rupees(value: float) -> str:
    return f"{value:,.0f}" if float(value).is_integer() else f"{value:,.2f}"


def as_facts(products: list[dict]) -> list[dict]:
    """Each product as a fact the assistant answers from."""
    out = []
    for p in products:
        more = ". ".join(f"{k}: {v}" for k, v in (p.get("details") or {}).items())
        out.append({"q": f"{p['code']} {p['name']}", "a": f"Code {p['code']}, {p['name']}, ₹{rupees(p['price'])}." + (f" {more}." if more else "")})
    return out
