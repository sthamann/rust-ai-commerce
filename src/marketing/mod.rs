//! Native rule conditions, coupons, durable flows and headless/storefront sales-channel boundaries.
use crate::*;
mod app_flows;
mod channels;
use app_flows::*;
mod catalog;
mod gateway;
mod jobs;
pub(crate) use gateway::invoke;
mod metadata;
pub(crate) use metadata::validate_metadata;
mod customer_facts;
mod facts;
mod flow_access;
mod flow_actions;
mod flow_mutations;
mod flows;
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
pub(crate) use routes::router;

#[cfg(test)]
mod pipeline_tests;
