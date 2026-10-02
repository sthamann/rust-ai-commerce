/** Execute the production adapter with a fake browser surface, never a Google network request. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const map=new Map(),scripts=[];const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
const context={localStorage:storage,window:{},location:{origin:'https://shop.test',pathname:'/',hash:'#checkout/private-ticket'},document:{createElement:()=>({dataset:{},remove(){scripts.splice(scripts.indexOf(this),1)}}),head:{appendChild:s=>scripts.push(s)}},Date,Set};
vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../../extensions/sdk/analytics.js',import.meta.url),'utf8').replace('export function createAnalytics','function createAnalytics'),context);
const a=context.createAnalytics({shop:'a',channel:'one',measurementId:'G-TEST12345'});
assert.equal(scripts.length,0);assert.equal(a.event('purchase',{transaction_id:'before'}),false);
a.consent(true);assert.equal(scripts.length,1);assert.equal(scripts[0].src,'https://www.googletagmanager.com/gtag/js?id=G-TEST12345');
a.event('view_item',{items:[{item_id:'mug',item_name:'Mug',price:24.9,quantity:1,email:'private@example.test'}],email:'private@example.test'});
a.event('page_view',{});assert(a.event('purchase',{transaction_id:'order-one',value:24.9}));assert(!a.event('purchase',{transaction_id:'order-one',value:24.9}));
let layer=JSON.stringify(context.window.dataLayer);assert(!layer.includes('private-ticket'));assert(!layer.includes('private@example.test'));assert(layer.includes('view_item'));assert(layer.includes('purchase'));assert(layer.includes('send_to'));
a.consent(false);assert.equal(scripts.length,0);assert(!a.event('view_item',{}));assert(context.window['ga-disable-G-TEST12345']);
const other=context.createAnalytics({shop:'b',channel:'one',measurementId:'G-OTHER12345'});assert.equal(scripts.length,0);other.consent(true);assert(other.event('purchase',{transaction_id:'order-one'}));other.dispose();
console.log('PASS consent defaults, actual gtag script URL, ecommerce payload allowlist, no customer identities/tickets, purchase deduplication and tenant-scoped choices');
