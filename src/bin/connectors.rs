//! Independent Rust standard-app service; no provider code executes in commerce request workers.
#[tokio::main]
async fn main() {
    if vendune::connectors::run().await.is_err() {
        eprintln!("Connector startup failed; check database, keys and migration 049");
        std::process::exit(1);
    }
}
