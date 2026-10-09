"""Exercise saved fact categories through native catalog/MCP, source review and selective staging; no models."""
import copy


def verify_intent_navigation(req, merchant, other, manual_product, check):
    query={'nodeType':'intent','minimumConfidence':0.8,'text':{'en':'cycling','de':None,'es':''}}
    data={'active':True,'visible':True,'type':'page','translations':{'en':{'name':'Cycling needs'}},'graphQuery':query}
    category=req('/api/merchant/categories',{'revision':None,'parentId':'catalog-root','position':0,'data':data},merchant)['id']
    payload=lambda:{'categoryId':category,'limit':1}
    def ids(locale='en-GB', body=None, headers=None):
        return req('/store-api/product',body or payload(),{**(headers or {}),'x-commerce-locale':locale})
    def propose(product, confidence, document=None):
        document=document or req('/api/knowledge/documents',{'title':'Cycling facts','content':'Suitable for cycling.','productId':product,'locale':'en-GB'},merchant)
        claim=req('/api/intelligence/claim.propose',{'productId':product,'sourceId':document['id'],'contentHash':document['contentHash'],
            'text':'Suitable for cycling.','quote':'Suitable for cycling.','locale':'en-GB','confidence':confidence,'nodeType':'intent'},merchant)
        return document,claim
    def confirm(claim):
        req('/api/intelligence/claim.review',{'id':claim['id'],'revision':1,'state':'confirmed','approve':True},merchant)
    def publish(document):
        req('/api/knowledge/documents/'+document['id'],{'revision':1,'visibility':'public','approve':True},merchant,'PUT')
    mug,mug_claim=propose('mug',0.9)
    confirm(mug_claim)
    assert not ids()['elements'], 'Private source entered public navigation'
    publish(mug)
    assert not ids()['elements'], 'A source revision change silently re-authorized an old claim'
    _,mug_claim=propose('mug',0.9,mug);confirm(mug_claim)
    lamp,lamp_claim=propose('lamp',0.9)
    publish(lamp)
    _,lamp_claim=propose('lamp',0.9,lamp)
    assert [p['id'] for p in ids()['elements']]==['mug'], 'Unreviewed source became public category membership'
    confirm(lamp_claim)
    low,low_claim=propose('notebook',0.4)
    publish(low);_,low_claim=propose('notebook',0.4,low);confirm(low_claim)
    first=ids();assert first['hasMore'] and first['elements'][0]['id']=='lamp'
    second=ids(body={**payload(),'after':first['nextCursor']})
    assert [p['id'] for p in second['elements']]==['mug'] and not second['hasMore']
    assert [p['id'] for p in ids('de-DE')['elements']]==[p['id'] for p in first['elements']], 'Inherited phrase mixed source languages'
    assert not ids('es-ES')['elements'], 'Explicit empty phrase incorrectly inherited'
    req('/store-api/product',payload(),other,expected=404)
    result=req('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'catalog.search','arguments':{'categoryId':category,'limit':10}}},merchant)['result']
    assert not result['isError'] and {p['id'] for p in result['structuredContent']['elements']}=={'lamp','mug'},result
    check('Saved fact category consumes current public confirmed intent claims through Store API/MCP; confidence, inheritance, empty language, tenant isolation and cursor pagination hold')
    # Real channel filtering happens before pagination, independent of graph membership.
    channel={'name':{'en':'Filtered intent shop'},'kind':'storefront','active':True,'locales':['en-GB'],
        'productIds':['mug'],'navigationCategoryId':category}
    req('/api/automation/channels/intent_filtered',{'revision':0,'data':channel},merchant,'PUT')
    assert [p['id'] for p in ids(headers={'sw-sales-channel-id':'intent_filtered'})['elements']]==['mug']
    # Manual membership is independent of whether public evidence remains admissible.
    product=req('/api/merchant/products/'+manual_product,h=merchant)
    for key in ['id','channels','mainLocale','availableLocales']:product.pop(key,None)
    product['catalog']['categoryIds'].append(category)
    req('/api/merchant/products/'+manual_product,product,merchant,'PUT')
    req('/api/knowledge/documents/'+mug['id']+'/lifecycle',{'revision':2,'archived':True,'approve':True},merchant)
    req('/api/knowledge/documents/'+lamp['id'],{'revision':2,'visibility':'private','approve':True},merchant,'PUT')
    assert [p['id'] for p in ids(body={'categoryId':category,'limit':10})['elements']]==[manual_product]
    check('Source archive/privacy immediately withdraw graph membership; manual assignments survive and channel filters apply before pagination')
    # Config is revision-bound and uses the existing category clone/release/history owner.
    row=next(c for c in req('/api/merchant/categories',h=merchant)['elements'] if c['id']==category)
    edit={'revision':row['revision'],'parentId':row['parentId'],'position':row['position'],'data':copy.deepcopy(row['data'])}
    for invalid in [{'nodeType':'intent','minimumConfidence':0.8,'text':{'en':'cycling'},'sql':'select'},
        {'nodeType':'intent','minimumConfidence':-1,'text':{'en':'cycling'}},
        {'nodeType':'intent','minimumConfidence':0.8,'text':{'en':'cycling','unknown':'cycling'}}]:
        req('/api/merchant/categories/'+category,{**edit,'data':{**data,'graphQuery':invalid}},merchant,'PUT',400)
    edit['data']['graphQuery']['text']['en']='%%%'
    req('/api/merchant/categories/'+category,edit,merchant,'PUT')
    assert [p['id'] for p in ids(body={'categoryId':category,'limit':10})['elements']]==[manual_product], 'LIKE wildcard escaped literal semantics'
    req('/api/merchant/categories/'+category,edit,merchant,'PUT',409)
    stage=req('/api/environments',{'name':'Fact category staging'},merchant)['id']
    staged={**merchant,'x-tenant':stage}
    row=next(c for c in req('/api/merchant/categories',h=staged)['elements'] if c['id']==category)
    assert row['data']['graphQuery']['text']['en']=='%%%'
    row['data']['graphQuery']['text']['en']='cycling'
    req('/api/merchant/categories/'+category,{'revision':row['revision'],'parentId':row['parentId'],'position':row['position'],'data':row['data']},staged,'PUT')
    unit=next(c for c in req('/api/environments/'+stage+'/diff',h=merchant)['changes'] if c['key']=='category:'+category)
    req('/api/environments/'+stage+'/release',{'approve':True,'selections':[{'key':unit['key'],'digest':unit['digest']}]},merchant)
    live=next(c for c in req('/api/merchant/categories',h=merchant)['elements'] if c['id']==category)
    assert live['data']['graphQuery']['text']['en']=='cycling'
    check('Closed graph-query configuration rejects unsafe fields; literal wildcards, CAS, clone and native selective category release remain connected')
