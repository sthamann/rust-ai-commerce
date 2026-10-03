//! A bounded acyclic flow graph models source-style true/false branches, ordered actions, delays and stop nodes.
use super::*;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Pipeline {
    pub entry: String,
    pub nodes: Vec<Node>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum Node {
    Condition {
        id: String,
        condition: rules::Condition,
        on_true: Option<String>,
        on_false: Option<String>,
    },
    Action {
        id: String,
        action: String,
        #[serde(default)]
        config: Value,
        next: Option<String>,
    },
    Delay {
        id: String,
        seconds: u64,
        next: Option<String>,
    },
    Stop {
        id: String,
    },
}
impl Node {
    pub(crate) fn id(&self) -> &str {
        match self {
            Self::Condition { id, .. }
            | Self::Action { id, .. }
            | Self::Delay { id, .. }
            | Self::Stop { id } => id,
        }
    }
    fn edges(&self) -> Vec<&str> {
        match self {
            Self::Condition {
                on_true, on_false, ..
            } => on_true.iter().chain(on_false).map(String::as_str).collect(),
            Self::Action { next, .. } | Self::Delay { next, .. } => {
                next.iter().map(String::as_str).collect()
            }
            Self::Stop { .. } => vec![],
        }
    }
}
impl Pipeline {
    pub(crate) fn validate(&self) -> Result<()> {
        if self.nodes.is_empty()
            || self.nodes.len() > 100
            || !self.nodes.iter().any(|n| n.id() == self.entry)
        {
            return Err(bad("Flow needs an entry and 1..100 nodes"));
        }
        let mut ids = std::collections::HashSet::new();
        for node in &self.nodes {
            if !apps::identifier(node.id()) || !ids.insert(node.id()) {
                return Err(bad("Invalid or duplicate flow node"));
            }
            match node {
                Node::Condition { condition, .. } => condition.validate(0)?,
                Node::Delay { seconds, .. }
                    if !rust_ai_commerce::verified_kernel::flow_delay_admissible(*seconds) =>
                {
                    return Err(bad("Flow delay exceeds 30 days"));
                }
                Node::Action { action, config, .. } => {
                    super::flow_actions::validate(action, config)?
                }
                _ => {}
            }
        }
        for node in &self.nodes {
            if node.edges().iter().any(|e| !ids.contains(e)) {
                return Err(bad("Flow edge references an absent node"));
            }
        }
        fn visit<'a>(
            id: &'a str,
            p: &'a Pipeline,
            active: &mut std::collections::HashSet<&'a str>,
            done: &mut std::collections::HashSet<&'a str>,
        ) -> Result<()> {
            if done.contains(id) {
                return Ok(());
            }
            if !active.insert(id) {
                return Err(bad("Flow graph contains a cycle"));
            }
            for edge in p.nodes.iter().find(|n| n.id() == id).unwrap().edges() {
                visit(edge, p, active, done)?
            }
            active.remove(id);
            done.insert(id);
            Ok(())
        }
        let mut done = std::collections::HashSet::new();
        visit(
            &self.entry,
            self,
            &mut std::collections::HashSet::new(),
            &mut done,
        )?;
        if done.len() != self.nodes.len() {
            return Err(bad("Flow graph contains unreachable nodes"));
        }
        Ok(())
    }
}
