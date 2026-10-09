"""Exact-decimal helpers for money arithmetic. Supabase (postgrest) returns `numeric`
columns as JSON numbers, which Python's json module parses into binary floats -- fine to
carry around, but summing/subtracting/comparing them directly accumulates rounding error.
Route any amount through `money()` before doing arithmetic; convert back with `to_float()`
only at the response boundary, since the wire format (and the frontend) stay float."""

from decimal import Decimal, ROUND_HALF_UP


def money(value) -> Decimal:
    """Parse a Supabase-returned amount into an exact Decimal. str() first -- Decimal(float)
    would preserve the float's binary imprecision instead of removing it."""
    return Decimal(str(value))


def to_float(value) -> float:
    """Round to the cent and hand back a float for JSON responses. Accepts a Decimal or a
    raw number (tests/callers sometimes pass a plain float straight through)."""
    return float(money(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
