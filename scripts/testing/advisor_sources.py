"""Actual channel-admitted advisor context and concurrent native source mutations; synthetic local model only."""
import concurrent.futures
import copy
import json
import uuid


def verify_advisor_sources(call, captured, behavior, started, release, passed):
    suffix = uuid.uuid4().hex[:10]
    owner = call('/api/auth/register', {'workspaceId': 'advice-source-'+suffix,
        'workspaceName': 'Native advisor sources', 'name': 'Fixture owner',
        'email': suffix+'@example.test', 'password': 'Synthetic-advice-2026!'}, headers={})
    mh = {'x-tenant': owner['workspace'], 'Authorization': 'Bearer '+owner['token']}
    sh = {'x-tenant': owner['workspace'], 'sw-sales-channel-id': 'advice_lamp',
          'x-commerce-locale': 'en-GB'}
    channel = {'name': {'en-GB': 'Only the visible lamp'}, 'kind': 'storefront',
        'active': True, 'locales': ['en-GB'], 'productIds': ['lamp']}
    call('/api/automation/channels/advice_lamp', {'revision': 0, 'data': channel}, mh, method='PUT')
    behavior.update(mode='advisor', advisor_block=False)

    def advice(expected=200):
        return call('/api/concierge', {'request': 'work'}, sh, expected=expected)

    def product():
        draft = call('/api/merchant/products/lamp', headers=mh)
        for key in ['id', 'channels', 'mainLocale', 'availableLocales']:
            draft.pop(key, None)
        return draft

    # The initial lookup finds other work products, but none may enter buyer context.
    visible = advice()
    prompt = captured[-1][2]['input']
    assert visible['answer']['recommended_ids'] == ['lamp']
    assert all(hit['id'] == 'lamp' for hit in visible['knowledge']['hits'])
    assert '"chair"' not in prompt and '"desk"' not in prompt and '"notebook"' not in prompt, prompt
    assert all(e['sourceId'] == 'lamp' for e in visible['knowledge']['graph']['edges'])
    assert not visible['knowledge']['graph']['observedPairs']
    passed('One native retrieval feeds localized catalog and buyer graph; channel-excluded hits/edges do not reach the actual provider or response')

    for mutation in ['price', 'stock', 'description', 'visibility', 'paused-channel', 'source-private', 'source-reassigned']:
        original = product()
        doc = None
        if mutation.startswith('source-'):
            text = 'Exact source statement '+uuid.uuid4().hex+'.'
            doc = call('/api/knowledge/documents', {'title': 'Current lamp source',
                'productId': 'lamp', 'content': text, 'locale': 'en-GB'}, mh)
            call('/api/knowledge/documents/'+doc['id'], {'revision': 1,
                'visibility': 'public', 'approve': True}, mh, method='PUT')
            # Publication changes the native document revision: propose against that current source.
            claim = call('/api/intelligence/claim.propose', {'productId': 'lamp',
                'sourceId': doc['id'], 'contentHash': doc['contentHash'], 'locale': 'en-GB',
                'text': text, 'quote': text, 'nodeType': 'property'}, mh)
            call('/api/intelligence/claim.review', {'id': claim['id'], 'revision': 1,
                'state': 'confirmed', 'approve': True}, mh)
        started.clear();release.clear();behavior['advisor_block'] = True
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            turn = executor.submit(advice, 409)
            try:
                assert started.wait(10), mutation
                if doc:
                    assert text in json.dumps(captured[-1][2]), mutation
                    current = call('/api/knowledge/documents/'+doc['id'], headers=mh)
                    if mutation == 'source-private':
                        call('/api/knowledge/documents/'+doc['id'], {'revision': current['revision'],
                            'visibility': 'private', 'approve': True}, mh, method='PUT')
                    else:
                        call('/api/knowledge/documents/'+doc['id'], {'revision': current['revision'],
                            'title': current['title'], 'content': current['content'], 'productId': 'chair'}, mh, method='PATCH')
                elif mutation == 'paused-channel':
                    current = next(c for c in call('/api/automation', headers=mh)['channels'] if c['id']=='advice_lamp')
                    paused = {**channel, 'active': False}
                    call('/api/automation/channels/advice_lamp', {'revision': current['revision'], 'data': paused}, mh, method='PUT')
                else:
                    draft = copy.deepcopy(original)
                    if mutation == 'price':draft['commerce']['price'] += 1
                    if mutation == 'stock':draft['commerce']['stock'] = 0
                    if mutation == 'description':draft['translations']['en-GB'] = {'name': 'Changed current lamp', 'description': 'Changed while inference was running.'}
                    if mutation == 'visibility':draft['catalog']['active'] = False
                    call('/api/merchant/products/lamp', draft, mh, method='PUT')
            finally:
                release.set()
            rejected = turn.result(timeout=15)
        assert 'answer' not in rejected and 'Advice sources changed' in json.dumps(rejected), (mutation, rejected)
        behavior['advisor_block'] = False
        if mutation == 'paused-channel':
            current = next(c for c in call('/api/automation', headers=mh)['channels'] if c['id']=='advice_lamp')
            call('/api/automation/channels/advice_lamp', {'revision': current['revision'], 'data': channel}, mh, method='PUT')
        elif not doc:
            original['revision'] = product()['revision']
            call('/api/merchant/products/lamp', original, mh, method='PUT')
        passed('Advisor rejects current native '+mutation+' changed during inference; no stale answer returned')
    advice()  # Restored sources still permit a normal positive response.
    behavior.update(mode='normal', advisor_block=False)
