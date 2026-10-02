"""Localized OAuth completion screen; never render provider codes, tokens or raw errors."""

from html import escape

MESSAGES = {
    "en": (
        "Account connected",
        "Return to Commerce Studio and refresh the app.",
        "Connection failed",
        "Authorization failed or expired. Start again in Commerce Studio.",
    ),
    "de": (
        "Konto verbunden",
        "Kehre ins Commerce Studio zurück und aktualisiere die App.",
        "Verbindung fehlgeschlagen",
        "Die Freigabe ist fehlgeschlagen oder abgelaufen. Starte erneut im Commerce Studio.",
    ),
    "fr": (
        "Compte connecté",
        "Revenez dans Commerce Studio et actualisez l’application.",
        "Échec de connexion",
        "L’autorisation a échoué ou expiré. Recommencez dans Commerce Studio.",
    ),
    "es": (
        "Cuenta conectada",
        "Vuelve a Commerce Studio y actualiza la app.",
        "Conexión fallida",
        "La autorización falló o caducó. Vuelve a empezar en Commerce Studio.",
    ),
}


def render(accept_language, success):
    language = accept_language.split(",")[0].split("-")[0].strip().lower()
    if language not in MESSAGES:
        language = "en"
    text = MESSAGES[language]
    title, message = text[:2] if success else text[2:]
    return f"""<!doctype html><html lang="{language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)}</title><style>body{{font:17px system-ui;background:#edf3ff;color:#172e51;margin:0;display:grid;min-height:100vh;place-items:center}}main{{max-width:480px;background:white;padding:48px;border:1px solid #d8e4f6;border-radius:24px;box-shadow:0 12px 50px #243c6010}}small{{color:#387bff}}h1{{font-size:30px}}p{{line-height:1.6}}</style><main><small>Commerce Studio</small><h1>{escape(title)}</h1><p>{escape(message)}</p></main></html>""".encode()
