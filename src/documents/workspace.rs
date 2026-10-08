//! Permission-filtered knowledge census, cursor source inventory and activity; totals never masquerade as sampled graph counts.
use super::*;
#[derive(Default, serde::Deserialize)]
pub(crate) struct WorkspaceQuery {
    pub after: Option<String>,
    pub query: Option<String>,
    pub archived: Option<bool>,
    pub kind: Option<String>,
}
pub(crate) async fn workspace(
    State(a): State<App>,
    h: RequestContext,
    axum::extract::Query(q): axum::extract::Query<WorkspaceQuery>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "knowledge.read")?;
    let query = q.query.as_deref().unwrap_or("");
    if query.len() > 200 || q.after.as_ref().is_some_and(|s| s.len() > 100) {
        return Err(bad("Knowledge filter too long"));
    }
    let locale = language_context(&a, &h).await?.0;
    let (settings, _) = commerce::config(&a, &t).await?;
    let totals:Value=sqlx::query_scalar("SELECT jsonb_build_object('products',(SELECT count(*) FROM products WHERE tenant=$1),'sources',(SELECT count(*) FROM knowledge_documents WHERE tenant=$1 AND NOT archived),'published',(SELECT count(*) FROM knowledge_documents WHERE tenant=$1 AND visibility='public' AND NOT archived),'archived',(SELECT count(*) FROM knowledge_documents WHERE tenant=$1 AND archived),'chunks',(SELECT count(*) FROM knowledge_chunks c JOIN knowledge_documents d ON d.tenant=c.tenant AND d.id=c.document_id WHERE c.tenant=$1 AND NOT d.archived),'indexedChunks',(SELECT count(*) FROM knowledge_chunks c JOIN knowledge_documents d ON d.tenant=c.tenant AND d.id=c.document_id WHERE c.tenant=$1 AND NOT d.archived AND embedding IS NOT NULL),'external',(SELECT count(*) FROM app_evidence e JOIN app_packages p ON p.tenant=e.tenant AND p.id=e.app WHERE e.tenant=$1 AND p.active),'observedPairs',(SELECT count(*) FROM observed_pairs WHERE tenant=$1),'processedEvents',(SELECT count(*) FROM knowledge_receipts WHERE tenant=$1),'approvedSuggestions',(SELECT count(*) FROM knowledge_hypotheses WHERE tenant=$1 AND state='published'),'productViews',(SELECT coalesce(sum(views),0) FROM session_signals WHERE tenant=$1),'cartAdds',(SELECT coalesce(sum(cart_adds),0) FROM session_signals WHERE tenant=$1),'reviews',(SELECT count(*) FROM product_reviews WHERE tenant=$1 AND approved))").bind(&t).fetch_one(&a.db).await?;
    let rows:Vec<Value>=sqlx::query_scalar("SELECT (to_jsonb(d)-'tenant'-'content'-'translations') || jsonb_build_object('title',COALESCE(d.translations->$6->>'title',d.translations->$7->>'title',d.title),'chunkCount',(SELECT count(*) FROM knowledge_chunks c WHERE c.tenant=d.tenant AND c.document_id=d.id),'indexedChunks',(SELECT count(*) FROM knowledge_chunks c WHERE c.tenant=d.tenant AND c.document_id=d.id AND embedding IS NOT NULL),'translationLocales',(SELECT coalesce(jsonb_agg(key),'[]') FROM jsonb_object_keys(d.translations) AS key)) FROM knowledge_documents d WHERE tenant=$1 AND id>$2 AND archived=$3 AND ($4='' OR title ILIKE '%' || $4 || '%' OR content ILIKE '%' || $4 || '%' OR translations::text ILIKE '%' || $4 || '%') AND ($5='' OR kind=$5) ORDER BY id LIMIT 51").bind(&t).bind(q.after.as_deref().unwrap_or("")).bind(q.archived.unwrap_or(false)).bind(query).bind(q.kind.as_deref().unwrap_or("")).bind(&locale).bind(&settings.main_locale).fetch_all(&a.db).await?;
    let next = if rows.len() > 50 {
        rows[49]["id"].clone()
    } else {
        Value::Null
    };
    let activity:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',id,'kind',kind,'time',created_at,'sourceId',data->'documentId','hypothesisId',data->'hypothesisId') FROM outbox WHERE tenant=$1 AND (kind LIKE 'knowledge.%' OR kind='intelligence.decision') ORDER BY id DESC LIMIT 20").bind(&t).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"totals":totals,"sources":rows.into_iter().take(50).collect::<Vec<_>>(),"next":next,"activity":activity,"mainLocale":settings.main_locale,"locales":settings.locales,"canWrite":auth::allowed(&h,"catalog"),"sampleLimits":{"sources":50,"activity":20,"graphNeeds":48,"graphPairs":48,"observations":24},"modelWeightsUpdated":false,"causalUpliftProven":false}),
    ))
}
