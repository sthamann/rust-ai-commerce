#!/usr/bin/env python3
"""Export deterministic example HTML and its operator uiDigests entry; never fetch remote resources."""
import argparse
import hashlib
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'extensions/sdk'))
from ui_bundle import bundle
parser=argparse.ArgumentParser()
parser.add_argument('app',choices=['product-lab','service-example'])
parser.add_argument('--output',type=Path)
args=parser.parse_args()
directory=ROOT/'extensions/apps'/args.app
ui=bundle((directory/'index.html').read_text(),(directory/'app.js').read_text() if args.app=='product-lab' else None)
if args.output:args.output.write_bytes(ui)
print(hashlib.sha256(ui).hexdigest())
