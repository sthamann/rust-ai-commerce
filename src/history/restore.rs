//! Restore snapshots by replaying validated entity edits; financial effects and publication are never copied from historical state.
use super::*;
pub(super) async fn apply(
    a: App,
    h: HeaderMap,
    entity: &str,
    id: String,
    state: Value,
    revision: i64,
) -> Result<Json<Value>> {
    let data = state["data"].clone();
    match entity {
 "product"=>product::restore(a,h,id,state,revision).await,
 "customer"=>operations::restore_customer(a,h,id,state,revision).await,
 "category"=>categories::save_category(State(a),h,Path(id),Json(json!({"revision":revision,"parentId":state["parent_id"],"position":state["position"],"data":data}))).await,
 "settings"=>commerce::save_config(State(a),h,Json(json!({"revision":revision,"data":data}))).await,
 "company"=>operations::restore_company(&a,&h,json!({"revision":revision,"data":data}),None).await,
 "companyChannel"=>{
  let t=merchant(&a,&h)?;let base:i64=sqlx::query_scalar("SELECT revision FROM receipt_settings WHERE tenant=$1").bind(t).fetch_one(&a.db).await?;
  operations::restore_company(&a,&h,json!({"revision":revision,"data":data,"baseRevision":base}),Some(&id)).await
 },
 "checkoutChannel"=>{
  let t=merchant(&a,&h)?;let (base,base_revision)=commerce::config(&a,&t).await?;
  let effective=commerce::restore_checkout_data(&base,data)?;
  commerce::save_scope(State(a),h,Path(id),Json(json!({"revision":revision,"baseRevision":base_revision,"data":effective}))).await
 },
 "rule"|"flow"|"promotion"|"channel"=>{
  let kind=match entity{"rule"=>"rules","flow"=>"flows","promotion"=>"promotions",_=>"channels"};
  let data=if entity=="rule"{json!({"name":state["name"],"condition":state["condition"],"active":state["active"]})}else{data};
  marketing::restore_config(State(a),h,Path((kind.into(),id)),Json(json!({"revision":revision,"data":data}))).await
 },
 "source"=>documents::restore_edit(State(a),h,Path(id),Json(json!({"revision":revision,"title":state["title"],"content":state["content"],"kind":state["kind"],"locale":state["locale"],"productId":state["product_id"],"translations":state["translations"]}))).await,
 _=>Err(bad("History restoration unavailable"))
 }
}
