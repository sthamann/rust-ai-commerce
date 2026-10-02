//! Evidence-based shop memory: event receipts, observed pairs, reviewable hypotheses and bounded context.
use crate::*;
mod context;
mod recommendations;
pub(crate) use recommendations::*;
mod projection;
mod routes;
pub(crate) use context::*;
pub(crate) use projection::*;
pub(crate) use routes::*;
