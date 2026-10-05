//! Native catalogue and checkout domains; pricing ports remain in the library.
use crate::*;
use rust_ai_commerce::pricing::{TaxRule, proportional_tax_rules};
mod types;
pub(crate) use types::*;
mod configuration;
pub(crate) use configuration::*;
mod tax;
pub(crate) use tax::*;
mod catalog;
pub(crate) use catalog::*;
mod delivery;
pub(crate) use delivery::*;
mod context_routes;
pub(crate) use context_routes::*;
mod detail;
pub(crate) use detail::*;
mod reviews;
pub(crate) use reviews::*;
mod settings_routes;
pub(crate) use settings_routes::*;
mod settings_validation;
pub(crate) use settings_validation::*;
mod settings_mutation;
pub(crate) use settings_mutation::*;
mod review_moderation;
pub(crate) use review_moderation::*;
mod fulfillment;
pub(crate) use fulfillment::*;

mod selection;
pub(crate) use selection::*;

mod product_edit;
pub(crate) use product_edit::*;

mod order_machine;
pub(crate) use order_machine::*;
mod order_workflow;
pub(crate) use order_workflow::*;

mod product_fields;
pub(crate) use product_fields::*;

mod order_fields;
pub(crate) use order_fields::*;

mod product_admin;
pub(crate) use product_admin::*;

mod product_channels;
pub(crate) use product_channels::*;
