//! Atomic idempotent enqueue, fair tenant admission and lease-fenced SKIP LOCKED claims for many workers.
use super::*;
use uuid::Uuid;
#[derive(Debug)]
pub struct Job {
    pub tenant: String,
    pub app: String,
    pub id: String,
    pub lease: Uuid,
    pub attempts: i32,
    pub payload: Value,
}
impl Store {
    pub async fn enqueue(&self, t: &str, a: &str, key: &str, payload: &Value) -> Result<Value> {
        checked(!key.is_empty() && key.len() <= 200, "Delivery key required")?;
        let fingerprint = digest(payload.to_string().as_bytes());
        let mut tx = self.tx(t).await?;
        sqlx::query(
            "INSERT INTO connector_limits(tenant,app) VALUES($1,$2) ON CONFLICT DO NOTHING",
        )
        .bind(t)
        .bind(a)
        .execute(&mut *tx)
        .await?;
        let limit=sqlx::query("SELECT *,day=CURRENT_DATE AS today FROM connector_limits WHERE tenant=$1 AND app=$2 FOR UPDATE").bind(t).bind(a).fetch_one(&mut *tx).await?;
        let existing: Option<String> = sqlx::query_scalar(
            "SELECT fingerprint FROM connector_jobs WHERE tenant=$1 AND app=$2 AND id=$3",
        )
        .bind(t)
        .bind(a)
        .bind(key)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(existing) = existing {
            if existing != fingerprint {
                return Err(Error::Conflict);
            }
            return Ok(json!({"jobId":key,"state":"accepted"}));
        }
        let queued:i64=sqlx::query_scalar("SELECT count(*) FROM connector_jobs WHERE tenant=$1 AND app=$2 AND state IN ('queued','running')").bind(t).bind(a).fetch_one(&mut *tx).await?;
        let daily = if limit.get::<bool, _>("today") {
            limit.get::<i64, _>("enqueued")
        } else {
            0
        };
        if daily >= bound("CONNECTOR_TENANT_DAILY", 10000)
            || queued >= bound("CONNECTOR_TENANT_BACKLOG", 1000)
        {
            return Err(Error::Quota);
        }
        sqlx::query(
            "UPDATE connector_limits SET enqueued=$3+1,day=CURRENT_DATE WHERE tenant=$1 AND app=$2",
        )
        .bind(t)
        .bind(a)
        .bind(daily)
        .execute(&mut *tx)
        .await?;
        sqlx::query("INSERT INTO connector_jobs(tenant,app,id,fingerprint,state,payload) VALUES($1,$2,$3,$4,'queued',$5)").bind(t).bind(a).bind(key).bind(fingerprint).bind(self.crypto.seal(t,a,payload)?).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(json!({"jobId":key,"state":"accepted"}))
    }
    pub async fn claim(&self, a: &str) -> Result<Option<Job>> {
        let mut tx = self.system().await?;
        // Lock a tenant limiter before any job: across processes this serializes rate/concurrency admission.
        let limits=sqlx::query("SELECT l.*,l.minute=date_trunc('minute',now()) AS this_minute FROM connector_limits l WHERE app=$1 AND (l.minute<>date_trunc('minute',now()) OR l.dispatched<$2) AND (SELECT count(*) FROM connector_jobs r WHERE r.tenant=l.tenant AND r.app=l.app AND r.state='running')<$3 AND EXISTS(SELECT 1 FROM connector_jobs j WHERE j.tenant=l.tenant AND j.app=l.app AND state='queued' AND available<=now()) ORDER BY last_started,tenant FOR UPDATE OF l SKIP LOCKED LIMIT 16").bind(a).bind(bound("CONNECTOR_TENANT_PER_MINUTE",120)).bind(bound("CONNECTOR_TENANT_CONCURRENCY",2)).fetch_all(&mut *tx).await?;
        for limit in limits {
            let t: String = limit.get("tenant");
            let running:i64=sqlx::query_scalar("SELECT count(*) FROM connector_jobs WHERE tenant=$1 AND app=$2 AND state='running'").bind(&t).bind(a).fetch_one(&mut *tx).await?;
            let minute = if limit.get::<bool, _>("this_minute") {
                limit.get::<i64, _>("dispatched")
            } else {
                0
            };
            if running >= bound("CONNECTOR_TENANT_CONCURRENCY", 2)
                || minute >= bound("CONNECTOR_TENANT_PER_MINUTE", 120)
            {
                continue;
            }
            let row=sqlx::query("SELECT id,payload,attempts FROM connector_jobs WHERE tenant=$1 AND app=$2 AND state='queued' AND available<=now() ORDER BY available,id FOR UPDATE SKIP LOCKED LIMIT 1").bind(&t).bind(a).fetch_optional(&mut *tx).await?;
            if let Some(row) = row {
                let id: String = row.get("id");
                let lease = Uuid::new_v4();
                sqlx::query("UPDATE connector_jobs SET state='running',attempts=attempts+1,lease_id=$4,lease_until=now()+interval '120 seconds' WHERE tenant=$1 AND app=$2 AND id=$3").bind(&t).bind(a).bind(&id).bind(lease).execute(&mut *tx).await?;
                sqlx::query("UPDATE connector_limits SET minute=date_trunc('minute',now()),dispatched=$3+1,last_started=now() WHERE tenant=$1 AND app=$2").bind(&t).bind(a).bind(minute).execute(&mut *tx).await?;
                let job = Job {
                    tenant: t.clone(),
                    app: a.into(),
                    id,
                    lease,
                    attempts: row.get::<i32, _>("attempts") + 1,
                    payload: self.crypto.open(&t, a, &row.get::<Vec<u8>, _>("payload"))?,
                };
                tx.commit().await?;
                return Ok(Some(job));
            }
        }
        Ok(None)
    }
    pub async fn finish(&self, j: &Job, state: &str, result: &Value, delay: u64) -> Result<bool> {
        let mut tx = self.tx(&j.tenant).await?;
        let count=sqlx::query("UPDATE connector_jobs SET state=$5,result=$6,available=now()+make_interval(secs=>$7),lease_id=NULL,lease_until=NULL WHERE tenant=$1 AND app=$2 AND id=$3 AND state='running' AND lease_id=$4 AND lease_until>now()").bind(&j.tenant).bind(&j.app).bind(&j.id).bind(j.lease).bind(state).bind(self.crypto.seal(&j.tenant,&j.app,result)?).bind(delay.min(3600) as f64).execute(&mut *tx).await?.rows_affected();
        tx.commit().await?;
        Ok(count == 1)
    }
    pub async fn recover(&self) -> Result<()> {
        let mut tx = self.system().await?;
        // Never steal an unexpired lease at startup: another healthy process can still own it.
        sqlx::query("UPDATE connector_jobs SET state='uncertain',lease_id=NULL,lease_until=NULL WHERE state='running' AND lease_until<=now()").execute(&mut *tx).await?;
        sqlx::query("DELETE FROM connector_oauth WHERE expires_at<now()")
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn jobs(&self, t: &str, a: &str) -> Result<Value> {
        let mut tx = self.tx(t).await?;
        let rows=sqlx::query("SELECT id,state,result,attempts FROM connector_jobs WHERE tenant=$1 AND app=$2 ORDER BY created_at DESC,id LIMIT 30").bind(t).bind(a).fetch_all(&mut *tx).await?;
        let mut jobs = vec![];
        for row in rows {
            let raw: Option<Vec<u8>> = row.get("result");
            jobs.push(json!({"id":row.get::<String,_>("id"),"state":row.get::<String,_>("state"),"attempts":row.get::<i32,_>("attempts"),"result":raw.map(|b|self.crypto.open(t,a,&b)).transpose()?}));
        }
        Ok(json!(jobs))
    }
}
fn bound(name: &str, default: i64) -> i64 {
    env::var(name)
        .ok()
        .and_then(|x| x.parse().ok())
        .filter(|v| *v > 0 && *v <= 1000000)
        .unwrap_or(default)
}
