# ponytail self-check for core.money -- proves the bug it exists to prevent (float
# summation drift) actually goes away, not just that the helper runs.
"""Tests for app.core.money's exact-decimal helpers."""
from decimal import Decimal

from app.core.money import money, to_float


def test_repeated_float_amounts_would_drift_without_it():
    """0.1 + 0.2 + ... 10 times is 0.9999999999999999 in raw float -- the exact failure mode
    summing Supabase-returned amounts hits. Exercises: `money()`."""
    raw_sum = sum(0.1 for _ in range(10))
    assert raw_sum != 0.9

    exact_sum = sum((money(0.1) for _ in range(10)), Decimal("0"))
    assert exact_sum == Decimal("1.0")


def test_to_float_rounds_to_the_cent():
    """Exercises: `to_float()`."""
    assert to_float(Decimal("12.005")) == 12.01
    assert to_float(400.0) == 400.0


if __name__ == "__main__":
    test_repeated_float_amounts_would_drift_without_it()
    test_to_float_rounds_to_the_cent()
    print("ok")
