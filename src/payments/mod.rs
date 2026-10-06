//! Provider-independent payment ledger and durable workers; the PayPal adapter supports explicit Sandbox/Live environments.
use crate::*;
mod operations;
mod paypal;
mod provider;
mod return_urls;
mod routes;
mod storage;
mod webhooks;
mod worker;
pub(crate) use operations::*;
pub(crate) use provider::*;
pub(crate) use routes::*;
pub(crate) use storage::*;
pub(crate) use worker::*;

mod receipt_guard;
use receipt_guard::receipt_matches;
