# Single Sign-On mit Microsoft Entra ID (Azure AD)

Die Anwendung unterstützt SSO über **Microsoft Entra ID** mit
[MSAL](https://github.com/AzureAD/microsoft-authentication-library-for-js)
(`@azure/msal-browser`, Redirect-Flow). SSO ist **optional**: Ohne Konfiguration
läuft die App unverändert mit lokaler Anmeldung.

## Ablauf

```
Browser                    Entra ID                   Backend
   │  „Mit Microsoft anmelden“ │                         │
   ├──── loginRedirect ───────►│                         │
   │◄─── Redirect + ID-Token ──┤                         │
   ├──────────── POST /api/auth/sso {idToken} ──────────►│
   │                           │   Signatur (JWKS), Audience,
   │                           │   Issuer, Ablauf prüfen │
   │◄──────────── App-JWT + Benutzerprofil ──────────────┤
```

- Der Client meldet sich per MSAL bei Entra ID an (Weiterleitung und zurück).
- Das Backend validiert das ID-Token kryptografisch gegen die öffentlichen
  Schlüssel des Tenants (JWKS) und prüft Audience (Client-ID), Issuer und Ablauf.
- Der Benutzer wird über die **E-Mail-Adresse** zugeordnet (Benutzername = E-Mail,
  Groß-/Kleinschreibung egal). Unbekannte E-Mail-Adressen werden automatisch als
  Benutzer mit Rolle „Benutzer“ angelegt (abschaltbar via `ENTRA_AUTO_CREATE=0`).
- Danach stellt das Backend das normale App-JWT aus – **Rollen (Admin) und
  Organisator-Zuweisungen werden weiterhin lokal in der App gepflegt.**
- Name und E-Mail aus dem Token erscheinen im Kopfbereich (Anzeigename) und in
  der Benutzerverwaltung.
- „Abmelden“ beendet bei SSO-Sitzungen auch die Entra-ID-Sitzung
  (`logoutRedirect`).

## Einrichtung in Azure (einmalig)

1. [Azure-Portal](https://portal.azure.com) → **Microsoft Entra ID** →
   **App-Registrierungen** → **Neue Registrierung**.
2. Name z. B. „Essensbestellung“, unterstützte Kontotypen: in der Regel
   „Nur Konten in diesem Organisationsverzeichnis“ (Single Tenant).
3. Unter **Authentifizierung** → **Plattform hinzufügen** →
   **Single-Page-Anwendung (SPA)** und die Redirect-URI(s) eintragen:
   - Entwicklung: `http://localhost:5173`
   - Produktion: `https://<eure-domain>` (die Adresse, unter der das Portal läuft)
4. Es wird **kein Client-Secret** benötigt (Public Client / SPA mit PKCE).
5. Die delegierten Standardberechtigungen (`openid`, `profile`, `email` /
   Microsoft Graph `User.Read`) genügen.

## Diese Werte musst du selbst eintragen

Von der Seite **Übersicht** der App-Registrierung:

| Azure-Portal | Variable (Client: `client/.env`) | Variable (Server: `server/.env`) |
| --- | --- | --- |
| Anwendungs-ID (Client) | `VITE_ENTRA_CLIENT_ID` | `ENTRA_CLIENT_ID` |
| Verzeichnis-ID (Mandant) | `VITE_ENTRA_TENANT_ID` | `ENTRA_TENANT_ID` |
| Redirect-URI (wie in Azure hinterlegt) | `VITE_ENTRA_REDIRECT_URI` | – |

Vorlagen liegen bereit: [`client/.env.example`](../client/.env.example) und
[`server/.env.example`](../server/.env.example) – jeweils als `.env` kopieren
und ausfüllen:

```bash
cp client/.env.example client/.env
cp server/.env.example server/.env
# Werte eintragen, dann:
npm run build     # VITE_-Werte werden beim Build eingebettet!
```

Optionen:

- `VITE_ENTRA_AUTO_REDIRECT=1` – Nutzer ohne Sitzung werden automatisch zum
  Microsoft-Login weitergeleitet (statt Login-Seite mit Button). Die lokale
  Anmeldung bleibt über direkte Eingabe erreichbar, falls die Weiterleitung
  fehlschlägt.
- `ENTRA_AUTO_CREATE=0` – nur vorab angelegte Benutzer (Benutzername =
  E-Mail-Adresse) dürfen sich per SSO anmelden.

## Produktionsbetrieb (Ubuntu-Installation)

Bei einer Installation über `install-essen-nigefa.sh`:

1. **Server:** die `ENTRA_*`-Werte in `/etc/essen-nigefa/essen-nigefa.env`
   ergänzen und den Dienst neu starten (`systemctl restart essen-nigefa`).
2. **Client:** `client/.env` im Quellverzeichnis anlegen (Redirect-URI =
   Produktions-URL!) und das Installationsskript erneut ausführen – es baut das
   Frontend neu und übernimmt dabei die `VITE_`-Werte.

## Hinweise

- Client- und Server-Konfiguration müssen zur **selben App-Registrierung**
  gehören, sonst schlägt die Audience-Prüfung fehl.
- Die Redirect-URI muss exakt übereinstimmen (Schema, Host, Port) – sonst zeigt
  Microsoft die Fehlermeldung `AADSTS50011`.
- Lokale Konten (z. B. der Seed-Admin `admin`) funktionieren parallel weiter.
  Um einem SSO-Benutzer Admin-Rechte zu geben: in der Benutzerverwaltung die
  Rolle des automatisch angelegten Kontos ändern.
