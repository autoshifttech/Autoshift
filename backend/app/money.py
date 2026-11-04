"""Money helpers. Everything is integer paise; never floats."""

PAISE = 100


def inr_to_paise(rupees: int) -> int:
    return rupees * PAISE


def gst_on(base_paise: int, rate: float) -> int:
    """GST added on top of a base amount, rounded to the nearest paisa."""
    return round(base_paise * rate)


def split_inclusive(total_paise: int, rate: float) -> tuple[int, int]:
    """Splits a GST-inclusive total into (base, gst)."""
    base = round(total_paise / (1 + rate))
    return base, total_paise - base


def yearly_paise(monthly_paise: int) -> int:
    """Yearly billing is 12 months for the price of 10."""
    return monthly_paise * 10
