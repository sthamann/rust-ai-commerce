#!/usr/bin/env python3
"""Gate the exact checkout boundary using totals from original Shopware calculators, never a PHP rewrite."""
import itertools
import json
import subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
cases = [dict(price=price, quantity=quantity, tax_rate=tax, gross=gross,
    calculated=calculated, decimals=2, interval=interval, round_for_net=round_net)
    for price, quantity, tax, gross, calculated, interval, round_net in itertools.product(
        [0, .005, .015, 1.005, 19.995, 100.125, 999.9999], [1, 3, 19], [0, 7, 19, 20],
        [True, False], [True, False], [.01, .05], [True, False])]
original = json.loads(subprocess.check_output(['php', 'reference/money-boundary.php'], cwd=ROOT, input=json.dumps(cases).encode()))
# Shopware decimal display is the expected currency boundary for the supported EUR checkout.
totals = [v['total'] for v in original]
actual = json.loads(subprocess.check_output([str(ROOT/'target/debug/money_boundary')], input=json.dumps(totals).encode()))
assert len(actual) == len(cases)
for index, (price, result) in enumerate(zip(original, actual)):
    expected = price['minor']
    assert result == {'minor':expected,'currency':{'code':'EUR','scale':2}}, (index,cases[index],price,result,expected)
print(f'PASS {len(cases)} original-Shopware totals cross the production EUR integer boundary exactly; no pricing rewrite')
