//! Provider-independent payment ledger and durable workers; the PayPal adapter supports explicit Sandbox/Live environments.

mod accounts;
mod app_commands;
pub(crate) use accounts::*;
pub(crate) use app_commands::{app_command, command_action};
mod contract;
pub(crate) use contract::*;
pub(crate) mod registry;
pub(crate) use registry::*;
mod generic_receipts;
mod operations;
mod paypal;
mod provider;
pub(crate) mod provider_configuration;
mod provider_webhooks;
pub(crate) mod remote;
mod return_urls;
mod routes;
pub(crate) mod sessions;
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
mod state;
