"""GSTIN checks and the GST split by place of supply (mirrors the app's own rules)."""

import re

STATE_CODES = {"35", "37", "12", "18", "10", "04", "22", "26", "07", "30", "24", "06", "02", "01", "20", "29", "32", "38", "31", "23", "27", "14", "17", "15", "13", "21", "34", "03", "08", "11", "33", "36", "16", "09", "05", "19"}
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def check_char(first14: str) -> str:
    total = 0
    for i, ch in enumerate(first14):
        product = CHARS.index(ch) * (1 if i % 2 == 0 else 2)
        total += product // 36 + product % 36
    return CHARS[(36 - total % 36) % 36]


def gstin_problem(raw: str) -> str | None:
    """None when valid, else 'format', 'state' or 'checksum'."""
    g = raw.strip().upper()
    if not GSTIN_RE.match(g):
        return "format"
    if g[:2] not in STATE_CODES:
        return "state"
    if check_char(g[:14]) != g[14]:
        return "checksum"
    return None


def split_tax(base_paise: int, gst_paise: int, buyer_state: str, seller_state: str) -> dict[str, int]:
    """Within the seller's state GST is CGST + SGST (half each); elsewhere it is IGST."""
    if buyer_state and buyer_state != seller_state:
        return {"cgst_paise": 0, "sgst_paise": 0, "igst_paise": gst_paise}
    half = gst_paise // 2
    return {"cgst_paise": half, "sgst_paise": gst_paise - half, "igst_paise": 0}
