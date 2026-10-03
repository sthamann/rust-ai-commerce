"""Four-language, provider-free commerce playground definitions; no credentials or real customer data."""


def names(en, de, fr, es):
    return dict(zip(("en", "de", "fr", "es"), (en, de, fr, es)))


def definitions():
    high_value = {"type": "shopwareCondition", "name": "cartCartAmount",
                  "config": {"operator": ">=", "amount": 100}}
    flow = {
        "name": names("Order routing playground", "Bestellrouting ausprobieren",
                      "Tester le routage des commandes", "Probar rutas de pedidos"),
        "active": True, "event": "order.placed", "condition": {"type": "alwaysValid"},
        "action": "pipeline", "instruction": {}, "locale": "en-GB",
        "pipeline": {"entry": "check", "nodes": [
            {"id": "check", "kind": "condition", "condition": {"type": "ruleReference", "ruleId": "demo_high_value"},
             "on_true": "priority", "on_false": "standard"},
            {"id": "priority", "kind": "action", "action": "action.add.order.tag",
             "config": {"tags": ["playground-priority"]}, "next": "wait"},
            {"id": "standard", "kind": "action", "action": "action.add.order.tag",
             "config": {"tags": ["playground-standard"]}, "next": "document"},
            {"id": "wait", "kind": "delay", "seconds": 15, "next": "document"},
            {"id": "document", "kind": "action", "action": "action.generate.document",
             "config": {"kind": "invoice"}, "next": "stop"},
            {"id": "stop", "kind": "stop"},
        ]},
    }
    return {
        "rules": {"demo_high_value": {
            "name": names("Cart total at least €100", "Warenkorb ab 100 €",
                          "Panier à partir de 100 €", "Carrito desde 100 €"),
            "active": True, "condition": high_value}},
        "promotions": {"demo_try10": {
            "name": names("Try 10% off", "10 % Rabatt ausprobieren",
                          "Tester une remise de 10 %", "Probar un descuento del 10 %"),
            "active": True, "code": "TRY10", "kind": "percentage", "amount": 10,
            "rule": {"type": "alwaysValid"}, "exclusive": False, "priority": 1,
            "maxUses": None, "start": None, "end": None}},
        "channels": {"demo_home": {
            "name": names("Home collection", "Wohnkollektion", "Collection maison", "Colección hogar"),
            "kind": "storefront", "active": True,
            "locales": ["en-GB", "de-DE", "fr-FR", "es-ES"],
            "productIds": ["mug", "lamp", "chair"]}},
        "flows": {"demo_order_routing": flow},
    }
