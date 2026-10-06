//! Database lease context: unknown tasks fail closed; trusted workers explicitly retain their scope.
use std::future::Future;

#[derive(Clone, Debug, Default)]
pub enum Scope {
    #[default]
    Denied,
    Tenant(String),
    System,
}
tokio::task_local! { static CONTEXT: Scope; }
pub fn current() -> Scope {
    CONTEXT.try_with(Clone::clone).unwrap_or_default()
}
pub async fn scoped<F: Future>(scope: Scope, future: F) -> F::Output {
    CONTEXT.scope(scope, future).await
}
pub fn spawn<F>(future: F) -> tokio::task::JoinHandle<F::Output>
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    tokio::spawn(scoped(current(), future))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn nested_context_and_spawn_cannot_leak_into_another_request() {
        assert!(matches!(current(), Scope::Denied));
        scoped(Scope::Tenant("one".into()), async {
            let child = spawn(async { current() });
            scoped(Scope::Tenant("two".into()), async {
                assert!(matches!(current(), Scope::Tenant(t) if t == "two"));
            })
            .await;
            assert!(matches!(child.await.unwrap(), Scope::Tenant(t) if t == "one"));
            assert!(matches!(current(), Scope::Tenant(t) if t == "one"));
        })
        .await;
        assert!(matches!(current(), Scope::Denied));
    }
}
