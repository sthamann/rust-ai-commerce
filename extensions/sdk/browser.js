/** Guest SDK: no merchant tokens or raw host API access; the host rechecks every action. */
export function connectCommerce() {
  return new Promise(resolve=>{
    const waiting=new Map();let context;
    addEventListener('message',event=>{
      if(event.source!==parent)return;
      if(event.data?.type==='commerce.context'){
        context=event.data;
        resolve({locale:context.locale,app:context.app,action:(action,input={})=>new Promise((accept,reject)=>{
          const id=crypto.randomUUID();const timeout=setTimeout(()=>{waiting.delete(id);reject(new Error('App action timed out'));},15000);
          waiting.set(id,{accept,reject,timeout});parent.postMessage({type:'commerce.action',nonce:context.nonce,id,action,input},'*');
        })});
      }
      if(context&&event.data?.type==='commerce.result'&&event.data.nonce===context.nonce){const pending=waiting.get(event.data.id);if(pending){clearTimeout(pending.timeout);waiting.delete(event.data.id);event.data.error?pending.reject(new Error(event.data.error)):pending.accept(event.data.result);}}
    });
  });
}
