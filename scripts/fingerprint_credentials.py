"""Report the shape of the email credentials a runner actually receives.

Temporary diagnostic for a Gmail 535 failure that only reproduces in CI. It
prints lengths, whitespace shape and truncated digests so the values can be
compared against a known-good pair without ever exposing them.
"""

from __future__ import annotations

import hashlib
import os


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def describe(name: str, reveal_domain: bool = False) -> None:
    raw = os.getenv(name, "")
    clean = raw.strip()
    print(f"{name}:")
    print(f"  present            {bool(raw)}")
    print(f"  raw length         {len(raw)}")
    print(f"  stripped length    {len(clean)}")
    print(f"  inner whitespace   {any(c.isspace() for c in clean)}")
    print(f"  non ascii          {any(ord(c) > 127 for c in clean)}")
    print(f"  sha256 of stripped {digest(clean)}")
    if reveal_domain:
        domain = clean.split("@")[-1] if "@" in clean else "(no @ present)"
        print(f"  domain             {domain}")
        print(f"  looks like email   {clean.count('@') == 1}")


def main() -> None:
    describe("EMAIL_USER", reveal_domain=True)
    describe("EMAIL_PASSWORD")
    describe("EMAIL_TO", reveal_domain=True)
    print(
        "\nCompare the sha256 values with the locally verified pair. "
        "Matching digests mean the runner has the working credentials."
    )


if __name__ == "__main__":
    main()
