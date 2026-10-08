//! Personal merchant accounts, tenant memberships, scoped sessions and role enforcement.
//! The legacy MERCHANT_TOKEN is an instance administrator bootstrap credential only.

mod abuse;
pub(crate) mod broker;
pub(crate) mod broker_credentials;
pub(crate) mod broker_inference;
mod credentials;
mod dto;
pub(crate) mod handoff;
mod identity;
mod integrations;
mod invitations;
pub(crate) use integrations::*;
mod members;
mod middleware;
pub(crate) mod route_policy;
pub(crate) use route_policy::SecureRoutes;
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
