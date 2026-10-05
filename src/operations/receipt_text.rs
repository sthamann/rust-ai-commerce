//! Four-language document labels and authoritative snapshot-to-print projection.
use super::*;
fn text(v: &Value) -> String {
    v.as_str().unwrap_or("").into()
}
pub(super) fn lines(v: &Value) -> Vec<String> {
    let lang = v["locale"].as_str().unwrap_or("en");
    let index = match lang {
        "de" => 1,
        "fr" => 2,
        "es" => 3,
        _ => 0,
    };
    let word = |w: [&str; 4]| w[index].to_string();
    let o = &v["order"];
    let c = &o["cart"];
    let title = match v["kind"].as_str().unwrap_or("") {
        "invoice" => word(["Invoice", "Rechnung", "Facture", "Factura"]),
        "delivery_note" => word([
            "Delivery note",
            "Lieferschein",
            "Bon de livraison",
            "Albaran",
        ]),
        _ => word([
            "Cancellation invoice",
            "Stornorechnung",
            "Facture d'annulation",
            "Factura de anulacion",
        ]),
    };
    let mut lines = vec![
        format!("{title} {}", text(&v["number"])),
        text(&v["issuedAt"]),
        text(&v["seller"]["name"]),
        text(&v["seller"]["address"]),
        format!(
            "{}: {}",
            word([
                "Tax ID",
                "Steuernummer",
                "Identifiant fiscal",
                "Identificación fiscal"
            ]),
            text(&v["seller"]["taxId"])
        ),
        String::new(),
        format!(
            "{}: {}",
            word(["Order", "Bestellung", "Commande", "Pedido"]),
            text(&o["orderNumber"])
        ),
    ];
    for (key, labels) in [
        (
            "vatId",
            ["VAT ID", "Umsatzsteuer-ID", "Numéro TVA", "Número IVA"],
        ),
        (
            "registrationNumber",
            [
                "Register number",
                "Registernummer",
                "Numéro registre",
                "Número registro",
            ],
        ),
        (
            "registerCourt",
            [
                "Register court",
                "Registergericht",
                "Tribunal registre",
                "Tribunal registro",
            ],
        ),
        (
            "managingDirectors",
            [
                "Managing directors",
                "Geschäftsführer",
                "Gérants",
                "Administradores",
            ],
        ),
        (
            "legalRepresentatives",
            [
                "Representatives",
                "Vertretungsberechtigte",
                "Représentants",
                "Representantes",
            ],
        ),
    ] {
        let value = text(&v["seller"][key]);
        if !value.is_empty() {
            lines.push(format!("{}: {value}", word(labels)));
        }
    }
    if let Some(reference) = v["referenceNumber"].as_str() {
        lines.push(format!(
            "{}: {reference}",
            word(["Reference", "Bezug", "Référence", "Referencia"])
        ));
    }
    let address = if v["kind"] == "delivery_note" {
        &o["shippingAddress"]
    } else {
        &o["billingAddress"]
    };
    let address = if address.is_object() {
        address
    } else {
        &c["checkout"]["address"]
    };
    for key in [
        "name",
        "company",
        "department",
        "street",
        "additionalAddressLine1",
        "additionalAddressLine2",
        "postalCode",
        "city",
        "country",
        "vatId",
    ] {
        let line = text(&address[key]);
        if !line.is_empty() {
            lines.push(line);
        }
    }
    lines.push(String::new());
    let cancellation = v["kind"] == "cancellation";
    let sign = if cancellation { -1. } else { 1. };
    if let Some(items) = c["lineItems"].as_array() {
        for item in items {
            lines.push(format!(
                "{} x {} [{}]",
                item["quantity"],
                text(&item["label"]),
                text(&item["referencedId"])
            ));
            if v["kind"] != "delivery_note" {
                lines.push(format!(
                    "  {:.2} EUR",
                    sign * item["price"]["totalPrice"].as_f64().unwrap_or(0.)
                ));
            }
        }
    }
    if v["kind"] != "delivery_note" {
        for (key, label) in [
            ("netPrice", word(["Net", "Netto", "Net", "Neto"])),
            ("tax", word(["Tax", "Steuer", "Taxe", "Impuesto"])),
            ("totalPrice", word(["Total", "Gesamt", "Total", "Total"])),
        ] {
            lines.push(format!(
                "{label}: {:.2} EUR",
                sign * c["price"][key].as_f64().unwrap_or(0.)
            ));
        }
        lines.push(format!(
            "{}: {:.2} EUR",
            word(["Shipping", "Versand", "Livraison", "Envío"]),
            sign * c["shippingCosts"]["totalPrice"].as_f64().unwrap_or(0.)
        ));
        if let Some(items) = c["lineItems"].as_array() {
            for item in items {
                if let Some(taxes) = item["price"]["calculatedTaxes"].as_array() {
                    for tax in taxes {
                        lines.push(format!(
                            "{} {}%: {:.2} EUR",
                            word(["VAT", "MwSt.", "TVA", "IVA"]),
                            tax["taxRate"],
                            sign * tax["tax"].as_f64().unwrap_or(0.)
                        ));
                    }
                }
            }
        }
    }
    lines
}
