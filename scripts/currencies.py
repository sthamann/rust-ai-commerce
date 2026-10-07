#!/usr/bin/env python3
"""Real tenant/channel multi-currency, precision, immutable order and durable fixed-price tests; no paid providers."""
import copy,json,os,time,urllib.request,urllib.error,uuid
from decimal import Decimal,ROUND_HALF_UP
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8787')
def req(path,body=None,h=None,method=None,expected=200,binary=False):
 request=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method or ('POST' if body is not None else 'GET'))
 try:
  with urllib.request.urlopen(request,timeout=30)as response:status=response.status;data=response.read();data=data if binary else json.loads(data)
 except urllib.error.HTTPError as e:status=e.code;data=json.load(e)
 assert status==expected,(path,status,expected,data)
 return data
def shop():
 s=uuid.uuid4().hex[:12];w=req('/api/auth/register',{'workspaceId':'fx-'+s,'workspaceName':'Currency fixture','name':'FX owner','email':'fx-'+s+'@example.test','password':'Synthetic-currency-2026!'})
 return {'x-tenant':w['workspace']},{'x-tenant':w['workspace'],'Authorization':'Bearer '+w['token']}
def configure(h,data):
 record=req('/api/merchant/commerce',h=h);return req('/api/merchant/commerce',{'data':data,'revision':record['revision']},h,'PUT')
def cart(h,code):
 c=req('/store-api/checkout/cart',{'session':uuid.uuid4().hex},{**h,'x-commerce-currency':code});hh={**h,'sw-context-token':c['token']};c=req('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'notebook','quantity':1}]},hh);return c,hh
def minor(v,scale):return int((Decimal(str(v))*10**scale).quantize(Decimal(1),rounding=ROUND_HALF_UP))
def mcp(h,name,args):return req('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args}},h)['result']
pub,admin=shop();foreign,foreign_admin=shop()
original=req('/api/merchant/commerce',h=admin);data=original['data'];cfg=data['currencies'];assert cfg['baseCurrency']=='EUR' and cfg['enabled']==['EUR']
for code,scale,rate,strategy in [('USD',2,'1.25000000','automatic'),('JPY',0,'160.00000000','automatic'),('KWD',3,'0.33333333','fixed')]:cfg['definitions'].append({'code':code,'scale':scale,'rate':rate,'strategy':strategy});cfg['enabled'].append(code)
configure(admin,data)
base=req('/api/merchant/products/notebook',h=admin)['commerce']['price']
c,h=cart(pub,'USD');assert c['price']['currency']=='USD' and c['price']['currencyScale']==2 and c['lineItems'][0]['price']['unitPrice']==float((Decimal(str(base))*Decimal('1.25')).quantize(Decimal('.01'),rounding=ROUND_HALF_UP))
assert req('/store-api/context',h=h)['currency']=='USD'
pdp=req('/store-api/product/notebook',{},h);assert pdp['product']['price']==c['lineItems'][0]['price']['unitPrice'] and all(v['currency']=='USD' for v in pdp['variants'])
assert mcp(h,'currency.list',{})['structuredContent']['currencyContext']['code']=='USD'
print('PASS API, PDP, variants, native context and MCP share USD prices')
options=req('/store-api/checkout/options',h=h);standard=next(x for x in options['shipping'] if x['id']=='standard');assert standard['price']==6.13 and options['currencyContext']['code']=='USD'
selection={**c['checkout'],'shippingMethodId':'standard','address':{'name':'FX customer','street':'Sample Street 1','postalCode':'12345','city':'Test','country':'DE'}}
c=req('/store-api/checkout/context',{'revision':c['revision'],'checkout':selection},h,'PUT');assert c['shippingCosts']['totalPrice']==6.13
promotion={'name':{'en':'FX coupon','de':'FX-Gutschein','es':'Cupón FX','fr':'Coupon FX'},'active':True,'code':'FXTEST','kind':'absolute','amount':1.01,'rule':{'type':'alwaysValid'},'exclusive':False,'priority':0,'maxUses':None,'start':None,'end':None}
req('/api/automation/promotions/fx_coupon',{'revision':0,'data':promotion},admin,'PUT')
c=req('/store-api/checkout/coupons',{'revision':c['revision'],'codes':['FXTEST']},h,'PUT');assert c['discountTotal']==1.26
print('PASS shipping/options and absolute coupons convert in the same selected currency')
c=req('/store-api/checkout/coupons',{'revision':c['revision'],'codes':[]},h,'PUT')
req('/store-api/checkout/currency',{'currency':'GBP','revision':c['revision']},h,'PUT',409)
req('/store-api/checkout/currency',{'currency':'JPY','revision':c['revision']-1},h,'PUT',409)
c=req('/store-api/checkout/currency',{'currency':'JPY','revision':c['revision']},h,'PUT');assert c['price']['currencyScale']==0 and c['lineItems'][0]['price']['unitPrice']==round(base*160)
c=req('/store-api/checkout/currency',{'currency':'USD','revision':c['revision']},h,'PUT')
u=req('/ucp/v1/checkout-sessions',{'currency':'JPY','line_items':[{'item':{'id':'notebook'},'quantity':1}]},pub);assert u['currency']=='JPY' and u['line_items'][0]['item']['price']==round(base*160)
u=req('/ucp/v1/checkout-sessions/'+u['id'],{'currency':'USD','line_items':[{'item':{'id':'notebook'},'quantity':1}]},{**pub,'sw-context-token':u['context_token']},'PUT');assert u['currency']=='USD'
print('PASS zero-decimal JPY, revision checks, explicit unsupported currency and UCP currency selection')
channel={'name':{'en':'Dollar channel','de':'Dollar-Kanal','es':'Canal dólar','fr':'Canal dollar'},'kind':'storefront','active':True,'locales':['en-GB','de-DE','es-ES','fr-FR'],'productIds':[],'navigationCategoryId':None}
req('/api/automation/channels/dollar',{'revision':0,'data':channel},admin,'PUT');path='/api/merchant/commerce/channels/dollar';s=req(path,h=admin);sc=s['data'];sc['currencies']['enabled']=['USD'];sc['currencies']['defaultCurrency']='USD';req(path,{'data':sc,'revision':s['revision'],'baseRevision':s['baseRevision']},admin,'PUT')
ch={**pub,'sw-sales-channel-id':'dollar'};default=req('/store-api/checkout/cart',{'session':'channel-fx'},ch);assert default['price']['currency']=='USD' and default['availableCurrencies']==['USD']
req('/store-api/checkout/cart',{'session':'forbidden-eur'},{**ch,'x-commerce-currency':'EUR'},expected=409)
print('PASS sales channel currency subset/default inheritance and admission')
review={'x-commerce-cart-revision':str(c['revision']),'x-commerce-total-minor':str(minor(c['price']['totalPrice'],2)),'x-commerce-currency':'USD','Idempotency-Key':'fx-'+uuid.uuid4().hex}
order=req('/store-api/checkout/order',h={**h,**review},method='POST');assert order['money']['currency']['code']=='USD' and order['money']['currency']['scale']==2 and order['currencyId']=='USD'
old=copy.deepcopy(order)
c2,h2=cart(pub,'USD');stale=copy.deepcopy(c2);d=req('/api/merchant/commerce',h=admin)['data'];next(v for v in d['currencies']['definitions']if v['code']=='USD')['rate']='1.50000000';configure(admin,d)
req('/store-api/checkout/order',h={**h2,'x-commerce-cart-revision':str(stale['revision']),'x-commerce-total-minor':str(minor(stale['price']['totalPrice'],2)),'x-commerce-currency':'USD','Idempotency-Key':'fx-stale-'+uuid.uuid4().hex},method='POST',expected=409)
assert req('/store-api/checkout/cart',h=h)['order']==old
assert req('/store-api/checkout/cart',h=h2)['lineItems'][0]['price']['unitPrice']==float((Decimal(str(base))*Decimal('1.5')).quantize(Decimal('.01'),rounding=ROUND_HALF_UP))
print('PASS FX changes require new review and preserve original order/currency/scale')
# Base reference changes preserve stored product EUR amounts and absolute shipping source.
d=req('/api/merchant/commerce',h=admin)['data'];d['currencies']['baseCurrency']='USD'
for definition in d['currencies']['definitions']:definition['rate']=str((Decimal(definition['rate'])/Decimal('1.5')).quantize(Decimal('.00000001'),rounding=ROUND_HALF_UP))
configure(admin,d);assert req('/store-api/checkout/cart',h=h2)['lineItems'][0]['price']['unitPrice']==float((Decimal(str(base))*Decimal('1.5')).quantize(Decimal('.01'),rounding=ROUND_HALF_UP))
print('PASS changing shop FX base does not relabel existing catalogue prices')
# A deliberate exact fixed price wins, with three-decimal money and normal destination tax handling.
p=req('/api/merchant/products/notebook',h=admin);p['extra']['currencyPrices']={'KWD':{'price':'7.123','listPrice':'8.234'}}
for field in ['id','channels','mainLocale','availableLocales']:p.pop(field,None)
req('/api/merchant/products/notebook',p,admin,'PUT');fixed,fh=cart(pub,'KWD');assert fixed['lineItems'][0]['price']['unitPrice']==7.123 and fixed['price']['currencyScale']==3
r=req('/api/merchant/commerce',h=admin);job=req('/api/merchant/currencies/price-jobs',{'currency':'KWD','revision':r['revision'],'overwrite':False},admin)
for _ in range(150):
 j=req('/api/merchant/currencies/price-jobs/'+job['id'],h=admin)
 if j['state']=='completed':break
 time.sleep(.1)
assert j['state']=='completed' and j['processed']>=6,j
assert req('/api/merchant/products/notebook',h=admin)['extra']['currencyPrices']['KWD']['price']=='7.123'
assert req('/api/merchant/products/chair',h=admin)['extra']['currencyPrices']['KWD']['price']
req('/api/merchant/currencies/price-jobs/'+job['id'],h=foreign_admin,expected=404)
assert mcp(foreign_admin,'merchant.currencies.job',{'id':job['id']})['isError']
req('/store-api/checkout/currency',{'currency':'USD','revision':fixed['revision']},{**foreign,'sw-context-token':fixed['token']},'PUT',404)
req('/api/merchant/currencies/price-jobs',{'currency':'KWD','revision':r['revision']},pub,expected=401)
assert req('/api/merchant/products/notebook',h=admin)['extra']['currencyPrices']['KWD']['price']=='7.123'
print('PASS durable bulk fixed prices preserve manual prices; foreign API/MCP/cart mutations are denied')
# Invalid source decimals/scales, duplicate codes and removed currency dependencies fail without state changes.
r=req('/api/merchant/commerce',h=admin)
for transform in [lambda c:c['definitions'][1].update(scale=0),lambda c:c.update(enabled=['EUR','EUR']),lambda c:c['definitions'][1].update(rate='NaN'),lambda c:c.update(pricingCurrency='USD')]:
 invalid=copy.deepcopy(r['data']);transform(invalid['currencies']);req('/api/merchant/commerce',{'data':invalid,'revision':r['revision']},admin,'PUT',400 if invalid['currencies']['pricingCurrency']=='EUR' else 409)
assert req('/api/merchant/commerce',h=admin)['revision']==r['revision']
print('PASS malformed configuration and monetary-source relabelling are rejected atomically')

fixed=req('/store-api/checkout/cart',h=fh)
kwd_order=req('/store-api/checkout/order',h={**fh,'Idempotency-Key':'kwd-'+uuid.uuid4().hex},method='POST');assert kwd_order['money']['currency']=={'code':'KWD','scale':3}
overview=req('/api/merchant/overview',h=admin);assert overview['summary']['revenue'] is None
assert set(v['currency']for v in overview['summary']['revenueByCurrency'])=={'USD','KWD'}
assert {v['currency'] for v in overview['orders']}=={'USD','KWD'}
print('PASS merchant API reports mixed turnover separately instead of relabelling a sum as EUR')
