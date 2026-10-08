"""Language-neutral wire contract example: validate full batches and public HMAC envelopes before effects."""
import hashlib,hmac,time

def envelopes(value,tenant,app):
    batch=value.get('events') if isinstance(value,dict) else None
    if batch is not None:
        if value.get('apiVersion')!='1' or value.get('tenant')!=tenant or value.get('app')!=app:
            raise ValueError('Event batch context mismatch')
        if not isinstance(batch,list) or not 1<=len(batch)<=25:
            raise ValueError('Event batch must contain 1..25 events')
    else:batch=[value]
    for event in batch:
        if not isinstance(event,dict):raise ValueError('Event must be an object')
        identifier=event.get('eventId')
        if isinstance(identifier,bool) or not isinstance(identifier,int) or identifier<=0 or event.get('tenant')!=tenant or event.get('idempotencyKey')!=f'{tenant}:{app}:{identifier}' or not isinstance(event.get('kind'),str) or not isinstance(event.get('data'),dict):
            raise ValueError('Event identity mismatch')
    return batch

def verify_signature(headers,raw,secret,tenant,app,now=None):
    """Resolve secret by expected tenant/app; never select a secret merely from untrusted headers."""
    stamp=headers.get('x-app-timestamp','');key=headers.get('x-app-event-id','');sig=headers.get('x-app-signature','')
    try:age=abs((time.time() if now is None else now)-int(stamp))
    except (TypeError,ValueError):raise ValueError('Invalid webhook timestamp')
    if age>300 or headers.get('x-tenant')!=tenant or headers.get('x-app-id')!=app or len(key)!=64 or len(raw)>65536:
        raise ValueError('Webhook context, size or expiry mismatch')
    expected=hashlib.sha256(f'{tenant}:{app}:{raw.hex()}'.encode()).hexdigest()
    if not hmac.compare_digest(key,expected):raise ValueError('Webhook event key mismatch')
    canonical=f'{tenant}\n{app}\n{stamp}\n{key}\n{hashlib.sha256(raw).hexdigest()}'
    actual=hmac.new(secret.encode(),canonical.encode(),hashlib.sha256).hexdigest()
    if not hmac.compare_digest(actual,sig):raise ValueError('Webhook signature mismatch')
    return key
