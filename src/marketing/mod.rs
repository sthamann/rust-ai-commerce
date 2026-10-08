//! Native rule conditions, coupons, durable flows and headless/storefront sales-channel boundaries.
use crate::*;
mod app_flows;
pub(crate) mod channel_access;
pub(crate) mod channel_preview;
mod channels;
use app_flows::*;
mod catalog;
mod gateway;
mod jobs;
pub(crate) use gateway::invoke;
mod metadata;
pub(crate) use metadata::validate_metadata;
mod customer_facts;
mod dependencies;
mod facts;
mod flow_access;
mod flow_actions;
mod flow_mutations;
mod flow_text;
mod flows;
mod lifecycle;
pub(crate) use lifecycle::{lock as lock_config, validate_references};
mod line_facts;
mod pipeline;
mod pipeline_runtime;
mod promotions;
mod routes;
mod rule_fields;
mod rule_match;
mod rule_snapshot;
mod rules;
pub(crate) use channels::*;
pub(crate) use flows::{flow_once, project_flows};
pub(crate) use promotions::*;
pub(crate) use routes::{router, save as restore_config};

#[cfg(test)]
mod pipeline_tests;

mod condition_gateway;
pub(crate) use condition_gateway::*;
