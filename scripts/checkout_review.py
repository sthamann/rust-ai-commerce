#!/usr/bin/env python3
"""Real SQL checkout rejects unreviewed changes without orders or stock writes; synthetic fixture only."""
import json, os, uuid, urllib.request, urllib.error
BASE = os.environ['BASE_URL']
checks = []
def call(path, body=None, headers=None, method=None, expected=200):
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(),
        headers={'Content-Type':'application/json', **(headers or {})}, method=method or ('GET' if body is None else 'POST'))
    try:
        with urllib.request.urlopen(req, timeout=30) as response: code, value = response.status, json.load(response)
    except urllib.error.HTTPError as error: code, value = error.code, json.load(error)
    assert code == expected, (path, code, value, expected)
    return value
def check(name): checks.append(name); print('PASS', name)
h = {'x-tenant':'atelier'}
ah = {**h, 'Authorization':'Bearer ' + os.environ['MERCHANT_TOKEN']}
c = call('/store-api/checkout/cart', {'session':uuid.uuid4().hex}, h)
h['sw-context-token'] = c['token']
c = call('/store-api/checkout/cart/line-item', {'items':[{'referencedId':'lamp','quantity':1}]}, h)
key = uuid.uuid4().hex
review = {**h,'Idempotency-Key':key,'x-commerce-cart-revision':str(c['revision']), 'x-commerce-total-minor':str(round(c['price']['totalPrice']*100))}
stock = call('/store-api/product/lamp', {}, h)['product']['stock']
orders = len(call('/api/search/order', {}, ah)['data'])
call('/store-api/checkout/order', {}, {**review,'x-commerce-total-minor':'1'}, expected=409)
call('/store-api/checkout/order', {}, {**review,'x-commerce-total-minor':'-1'}, expected=409)
call('/store-api/checkout/order', {}, {**review,'x-commerce-cart-revision':'0'}, expected=409)
call('/store-api/checkout/order', {}, {**review,'x-commerce-cart-revision':'invalid'}, expected=400)
call('/store-api/checkout/order', {}, {**h,'Idempotency-Key':key,'x-commerce-total-minor':'100'}, expected=400)
assert len(call('/api/search/order', {}, ah)['data']) == orders
assert call('/store-api/product/lamp', {}, h)['product']['stock'] == stock
check('Changed amount/revision and malformed partial review are rejected without orders or stock writes')
# Updating quantity invalidates the old review even when the caller supplies the new amount.
next_cart = call('/store-api/checkout/cart', {'revision':c['revision'],'items':[{'id':'lamp','quantity':2}]}, h, 'PUT')
call('/store-api/checkout/order', {}, {**review,'x-commerce-total-minor':str(round(next_cart['price']['totalPrice']*100))}, expected=409)
check('A stale cart revision cannot purchase an updated cart')
call('/store-api/checkout/order', {}, {**review,'x-tenant':'workshop'}, expected=404)
check('Reviewed cart tokens cannot purchase in a foreign tenant')
review.update({'x-commerce-cart-revision':str(next_cart['revision']), 'x-commerce-total-minor':str(round(next_cart['price']['totalPrice']*100))})
order = call('/store-api/checkout/order', {}, review)
assert call('/store-api/checkout/order', {}, {**review,'x-commerce-total-minor':'1'})['id'] == order['id']
assert call('/store-api/product/lamp', {}, h)['product']['stock'] == stock - 2
check('Explicit current review succeeds and replay returns the original order without a second reservation')
assert 'media' in next_cart['lineItems'][0]
assert next_cart['shippingMethodOptions'] and next_cart['paymentMethodOptions']
assert all('countries' in p for p in next_cart['paymentMethodOptions'])
check('Country-edit candidates and native cart media are part of the quote contract')
if os.getenv('REPORT_PATH'):
    from pathlib import Path
    Path(os.environ['REPORT_PATH']).write_text(json.dumps({'passed':len(checks),'checks':checks,'realMoneyCharged':False},indent=2)+'\n')
