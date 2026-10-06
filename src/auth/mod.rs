//! Personal merchant accounts, tenant memberships, scoped sessions and role enforcement.
//! The legacy MERCHANT_TOKEN is an instance administrator bootstrap credential only.
use crate::*;
pub(crate) mod broker;
pub(crate) mod broker_inference;
mod credentials;
pub(crate) mod handoff;
mod integrations;
mod invitations;
pub(crate) use integrations::*;
mod members;
mod middleware;
mod permissions;
pub(crate) use permissions::*;
mod provision;
mod registration;
pub(crate) use provision::{create_workspace, provision_shop};
mod sessions;
pub(crate) use credentials::*;
pub(crate) use invitations::*;
pub(crate) use members::*;
pub(crate) use middleware::*;
pub(crate) use registration::*;
pub(crate) use sessions::*;
