"""Concurrent privacy mutations across the real concierge/provider path; no live inference."""
import concurrent.futures
import json
import uuid


def verify_advisor_privacy(call, captured, behavior, started, release, passed):
    def new_context(shared=True):
        cart = call('/store-api/checkout/cart', {'session': 'advice-'+uuid.uuid4().hex},
                    headers={'x-tenant': 'atelier'})
        h = {'x-tenant': 'atelier', 'sw-context-token': cart['token']}
        policy = call('/store-api/legal', headers=h)['policyVersion']
        call('/store-api/privacy/consent', {'policyVersion': policy,
             'choices': {'personalization': True}}, h, method='PUT')
        graph = {'nodes': [{'id': 'style', 'kind': 'style',
                 'value': 'PRIVATE-'+uuid.uuid4().hex, 'productId': None}], 'edges': []}
        call('/store-api/intelligence/preferences', {'graph': graph, 'revision': 0,
             'useForAdvice': shared}, h, method='PUT')
        return h, policy, graph

    def advice(h, expected=200):
        return call('/api/concierge', {'request': 'Recommend a lamp for my desk'}, h,
                    expected=expected)

    def prompt():
        return json.dumps(captured[-1][2])

    behavior.update(mode='advisor', advisor_block=False)
    h, policy, graph = new_context()
    value = advice(h)
    assert value['answer']['recommended_ids'] == ['lamp']
    assert graph['nodes'][0]['value'] in prompt()
    # Saving a preference alone does not authorize model sharing.
    unshared, _, hidden = new_context(False)
    advice(unshared)
    assert hidden['nodes'][0]['value'] not in prompt()
    assert graph['nodes'][0]['value'] not in prompt()
    passed('Actual advisor receives only explicitly shared, currently consented preferences from its own cart')

    for mutation in ['withdraw', 'erase', 'unshare', 'edit', 'erase-recreate']:
        h, policy, graph = new_context()
        started.clear();release.clear()
        behavior['advisor_block'] = True
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            turn = executor.submit(advice, h, 409)
            try:
                assert started.wait(10), mutation
                assert graph['nodes'][0]['value'] in prompt(), mutation
                if mutation == 'withdraw':
                    call('/store-api/privacy/consent', {'policyVersion': policy,
                         'choices': {}}, h, method='PUT')
                elif mutation in ['erase', 'erase-recreate']:
                    call('/store-api/intelligence/preferences', headers=h, method='DELETE')
                    if mutation == 'erase-recreate':
                        # Identical content and revision 1 still represent a new memory.
                        call('/store-api/intelligence/preferences', {'graph': graph,
                             'revision': 0, 'useForAdvice': True}, h, method='PUT')
                else:
                    if mutation == 'edit':
                        graph['nodes'][0]['value'] = 'Changed after inference started'
                    call('/store-api/intelligence/preferences', {'graph': graph,
                         'revision': 1, 'useForAdvice': mutation != 'unshare'}, h, method='PUT')
            finally:
                release.set()
            rejected = turn.result(timeout=15)
        assert 'answer' not in rejected and 'Private advice context changed' in json.dumps(rejected), rejected
        behavior['advisor_block'] = False
        passed('Advisor discards in-flight private answer after '+mutation)

    # The comparison cannot reject every slow response or unrelated cart edits.
    h, _, graph = new_context()
    other, _, other_graph = new_context()
    started.clear();release.clear();behavior['advisor_block'] = True
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        turn = executor.submit(advice, h)
        try:
            assert started.wait(10)
            call('/store-api/intelligence/preferences', {'graph': other_graph,
                 'revision': 1, 'useForAdvice': False}, other, method='PUT')
        finally:
            release.set()
        assert turn.result(timeout=15)['answer']['recommended_ids'] == ['lamp']
    passed('Unchanged admitted context completes despite unrelated cart mutation; no cross-context false invalidation')
    behavior.update(mode='normal', advisor_block=False)
