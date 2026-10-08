//! One fresh, server-owned admission read shared by domain, identity, availability, channel and proxy middleware.
use crate::*;

#[derive(Clone, Debug)]
pub(crate) struct ChannelSnapshot {
    pub data: Value,
    pub revision: i64,
}
#[derive(Clone, Debug)]
pub(crate) struct FrontendMount {
    pub origin: String,
    pub experience_alias: String,
}
#[derive(Clone, Debug)]
pub(crate) struct AccessSnapshot {
    pub tenant: String,
    pub channel_id: String,
    pub exists: bool,
    pub parent: Option<String>,
    pub status: Option<String>,
    pub channel: Option<ChannelSnapshot>,
    pub mount: Option<FrontendMount>,
}
impl AccessSnapshot {
    pub(crate) async fn load(
        a: &App,
        alias: Option<&str>,
        tenant: &str,
        channel: &str,
    ) -> Result<Arc<Self>> {
        let r = sqlx::query(include_str!("access_snapshot.sql"))
            .bind(alias)
            .bind(tenant)
            .bind(channel)
            .fetch_one(&a.db)
            .await?;
        Ok(Arc::new(Self {
            tenant: r.get("tenant"),
            channel_id: r.get("channel"),
            exists: r.get("exists"),
            parent: r.get("parent"),
            status: r.get("status"),
            channel: r
                .get::<Option<Value>, _>("channel_data")
                .map(|data| ChannelSnapshot {
                    data,
                    revision: r.get("channel_revision"),
                }),
            mount: r
                .get::<Option<String>, _>("origin")
                .map(|origin| FrontendMount {
                    origin,
                    experience_alias: r.get("experience_alias"),
                }),
        }))
    }
    pub(crate) fn matches(&self, h: &RequestContext) -> bool {
        tenant(h).is_ok_and(|t| t == self.tenant)
    }
}
