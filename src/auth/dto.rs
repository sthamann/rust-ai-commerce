//! Stable typed authentication envelopes; field validation remains in the shared credential owner.
use serde::{Deserialize, Serialize};
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Login {
    pub email: String,
    pub password: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Register {
    pub email: String,
    pub name: String,
    pub password: String,
    pub workspace_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_name: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Integration {
    pub name: String,
    pub permissions: Vec<String>,
    pub expires_in_days: u32,
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credentials_have_a_known_shape() {
        assert!(serde_json::from_str::<Login>(r#"{"email":7,"password":false}"#).is_err());
        assert!(
            serde_json::from_str::<Login>(
                r#"{"email":"a@b.c","password":"long password","role":"owner"}"#
            )
            .is_err()
        );
        assert!(
            serde_json::from_str::<Register>(
                r#"{"email":"a@b.c","name":"A","password":"long password","workspaceId":"example"}"#
            )
            .is_ok()
        );
        assert!(
            serde_json::from_str::<Integration>(
                r#"{"name":"key","permissions":"owner","expiresInDays":1}"#
            )
            .is_err()
        );
    }
}
