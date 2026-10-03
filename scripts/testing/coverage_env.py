#!/usr/bin/env python3
"""Convert trusted cargo-llvm-cov environment output to GitHub's environment-file syntax."""
import shlex
import sys

for line in sys.stdin:
    name, separator, value = line.strip().removeprefix("export ").partition("=")
    if not separator or not name.replace("_", "").isalnum():
        raise ValueError("Invalid coverage environment assignment")
    parsed = shlex.split(value)
    if len(parsed) != 1 or "\n" in parsed[0]:
        raise ValueError("Invalid coverage environment value")
    print(name + "=" + parsed[0])
