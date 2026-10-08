"""Concurrent two-product allocation/release on the actual HTTP path, reused by strict runtime verification."""
import concurrent.futures
import uuid


def verify(call, bases, owner, tenant):
    shopper = {'x-tenant': tenant}
    initial = {pid: call(bases[0], '/store-api/product/'+pid, h=shopper)['product']['stock'] for pid in ['lamp','mug']}
    carts = []
    for index in range(2):
        base = bases[index]
        cart = call(base, '/store-api/checkout/cart', {'session':uuid.uuid4().hex}, shopper)
        h = {**shopper, 'sw-context-token':cart['token'], 'Idempotency-Key':uuid.uuid4().hex}
        items = [{'referencedId':'lamp','quantity':1}, {'referencedId':'mug','quantity':2}]
        call(base, '/store-api/checkout/cart/line-item', {'items':items if index==0 else items[::-1]}, h)
        carts.append((base,h))
    def checkout(pair):
        return call(pair[0], '/store-api/checkout/order', {}, pair[1])
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        orders = list(pool.map(checkout,carts))
    assert len({order['id'] for order in orders}) == 2
    for pid, quantity in [('lamp',2),('mug',4)]:
        assert call(bases[1], '/store-api/product/'+pid, h=shopper)['product']['stock'] == initial[pid]-quantity
    def cancel(pair):
        index, order = pair
        base = bases[index]
        h = {**owner, 'Idempotency-Key':uuid.uuid4().hex}
        current = call(base, '/api/merchant/orders/'+order['id'], h=h)
        body = {'kind':'order','state':'cancelled','revision':current['revision']}
        call(base, '/api/merchant/orders/'+order['id']+'/transition', body, h)
        call(bases[1-index], '/api/merchant/orders/'+order['id']+'/transition', body, h)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(cancel,enumerate(orders)))
    for pid in initial:
        assert call(bases[1], '/store-api/product/'+pid, h=shopper)['product']['stock'] == initial[pid]
    print('PASS opposite-order multi-product checkouts and concurrent idempotent cancellations restore exact stock across replicas')
