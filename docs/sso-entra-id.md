# Single Sign-On mit Microsoft Entra ID (Azure AD)

Die Anwendung unterstützt SSO über **Microsoft Entra ID** mit
[MSAL](https://github.com/AzureAD/microsoft-authentication-library-for-js)
(`@azure/msal-browser`, Redirect-Flow). SSO ist **optional** und wird
vollständig im **Admin-Bereich** (Admin → Anmeldung (SSO)) konfiguriert – kein
Neu-Build und keine Umgebungsvariablen nötig. Ohne Konfiguration läuft die App
unverändert mit lokaler Anmeldung.

Die App verwendet **kein Client-Secret**. Stattdessen kommt eine
**Verbundanmeldeinformation** (Federated Identity Credential) zum Einsatz.

## Was ist eine Verbundanmeldeinformation – und warum kein Secret?

Ein klassisches **Client-Secret** ist ein Passwort der App: Es wird in Azure
erzeugt, muss sicher gespeichert, regelmäßig **rotiert** und bei Ablauf erneuert
werden. Läuft es ab oder wird es kompromittiert, steht die Anmeldung still bzw.
ist angreifbar.

Eine **Verbundanmeldeinformation** (Workload Identity Federation) ersetzt das
Secret durch **Vertrauen auf Basis kryptografischer Signaturen**: Das Portal
besitzt ein eigenes Schlüsselpaar und legt seinen öffentlichen Schlüssel unter
einer OIDC-Discovery-Adresse offen. In Azure hinterlegt man einmalig, welchem
**Issuer** (dem Portal), welchem **Subject** und welcher **Audience** vertraut
wird. Möchte der Server ein Token von Entra ID holen, signiert er eine kurze
Behauptung („Client-Assertion") mit seinem privaten Schlüssel; Entra ID prüft
die Signatur über den öffentlichen Schlüssel des Portals.

**Vorteil:** Es gibt **kein Geheimnis, das gespeichert, gesichert oder rotiert
werden müsste**. Der private Schlüssel verlässt den Server nie, läuft nicht ab
und taucht in keiner Konfigurationsdatei im Klartext auf.

## Zwei Mechanismen im Überblick

| | Benutzer-Login | App-Anmeldung des Servers |
| --- | --- | --- |
| Zweck | Person meldet sich an | Server holt Token von Entra ID (Verbindungstest / Graph) |
| Verfahren | Authorization Code + PKCE (Public Client / SPA) | client_credentials + **Client-Assertion** (Verbundanmeldung) |
| Geheimnis | keins (PKCE) | keins (signierter Schlüssel statt Secret) |

```
Benutzer-Login:
Browser                    Entra ID                   Backend
   │  „Mit Microsoft anmelden“ │                         │
   ├──── loginRedirect (PKCE) ►│                         │
   │◄─── Redirect + ID-Token ──┤                         │
   ├──────────── POST /api/auth/sso {idToken} ──────────►│
   │                           │  Signatur (JWKS), Audience,
   │                           │  Issuer, Ablauf prüfen  │
   │◄──────────── App-JWT + Benutzerprofil ──────────────┤

Verbindungstest (Verbundanmeldung):
Backend ── signierte Client-Assertion ──► Entra ID
Entra ID ── ruft <Portal>/.well-known/openid-configuration + JWKS ab
Entra ID ── prüft Signatur, iss/sub/aud ──► Access-Token
```

- Der Benutzer wird über die **E-Mail-Adresse** zugeordnet (Benutzername =
  E-Mail, Groß-/Kleinschreibung egal). Unbekannte Adressen werden automatisch als
  Benutzer angelegt (abschaltbar via `ENTRA_AUTO_CREATE=0`).
- Rollen (Admin) und Organisator-Zuweisungen werden weiterhin **lokal in der App**
  gepflegt. Name und E-Mail aus dem Token erscheinen im Kopfbereich und in der
  Benutzerverwaltung.
- „Abmelden“ beendet bei SSO-Sitzungen auch die Entra-ID-Sitzung.

## Welche Werte das Portal verwendet (Callback & Verbundanmeldung)

Diese Werte trägt man in Azure ein. **Der Admin-Bereich (Anmeldung (SSO)) zeigt
sie unten copy-fertig für die eigene Installation an.**

| Zweck | Wert |
| --- | --- |
| **Redirect-URI** (Azure: Plattform „Single-Page-Anwendung") | Die **Basis-Adresse des Portals ohne Pfad**, z. B. `https://essen.example.de` (Entwicklung: `http://localhost:5173`) |
| Verbundanmeldung → **Issuer** | Dieselbe Portal-Basis-Adresse, z. B. `https://essen.example.de` |
| Verbundanmeldung → **Subject identifier** | `essensbestellung-sso` (Standard, im Admin-Bereich änderbar) |
| Verbundanmeldung → **Audience** | `api://AzureADTokenExchange` (Standardwert von Entra ID) |

Ergänzende Endpunkte, die das Portal automatisch bereitstellt (Entra ID ruft sie
zur Signaturprüfung ab – müssen öffentlich per HTTPS erreichbar sein):

- OIDC-Discovery: `<Portal-Basis-Adresse>/.well-known/openid-configuration`
- Schlüssel (JWKS): `<Portal-Basis-Adresse>/api/sso/jwks`

> **Wichtig:** Die Redirect-URI ist die **Origin ohne Pfad** (kein
> `/login`, kein `/callback`). MSAL kehrt genau zur Startadresse zurück und
> verarbeitet den Login dort. Weicht die eingetragene URI ab (Schema, Host,
> Port), zeigt Microsoft `AADSTS50011`.

## SSO auf einem neuen Server einrichten (Schritt für Schritt)

**A) App-Registrierung in Azure anlegen**

1. [Azure-Portal](https://portal.azure.com) → **Microsoft Entra ID** →
   **App-Registrierungen** → **Neue Registrierung**.
2. Name z. B. „Essensbestellung", Kontotypen i. d. R. „Nur Konten in diesem
   Organisationsverzeichnis" (Single Tenant) → **Registrieren**.
3. Auf der Seite **Übersicht** die **Anwendungs-ID (Client)** und die
   **Verzeichnis-ID (Mandant)** notieren.

**B) Redirect-URI hinterlegen**

4. **Authentifizierung** → **Plattform hinzufügen** → **Single-Page-Anwendung**.
5. Als Redirect-URI die **Portal-Basis-Adresse** eintragen (z. B.
   `https://essen.example.de`) → **Konfigurieren**. Kein Client-Secret anlegen.

**C) Verbundanmeldeinformation einrichten**

6. **Zertifikate & Geheimnisse** → Reiter **Verbundanmeldeinformationen** →
   **Anmeldeinformationen hinzufügen**.
7. Szenario **„Anderer Aussteller" (Other issuer)** wählen und eintragen:
   - **Issuer**: Portal-Basis-Adresse (z. B. `https://essen.example.de`)
   - **Subject identifier**: `essensbestellung-sso`
   - **Audience**: `api://AzureADTokenExchange` (Standard)
   - **Name**: frei, z. B. `essensbestellung-portal`
8. Speichern.

**D) Im Portal aktivieren**

9. Als Administrator anmelden → **Admin → Anmeldung (SSO)**.
10. **Client-ID** und **Tenant-ID** aus Schritt 3 eintragen.
11. Bei **Issuer-URL** auf **„Übernehmen"** klicken (setzt die aktuelle Portal-
    Adresse); Subject/Audience leer lassen = Standardwerte.
12. **„Verbindung testen"** klicken – bei Erfolg meldet das Portal, dass ein
    Token von Entra ID geholt wurde. Andernfalls wird die konkrete
    Entra-Fehlermeldung (`AADSTS…`) angezeigt.
13. Schalter **„SSO aktivieren"** setzen → **Speichern**. Der
    „Mit Microsoft anmelden"-Button erscheint nun auf der Login-Seite.

## SSO auf einem bestehenden Server nachrüsten / umstellen

- **Neu nachrüsten:** Schritte A–D wie oben. Es sind **keine Code-Änderungen und
  kein Neu-Build** nötig – die Konfiguration erfolgt vollständig im Admin-Bereich
  und wirkt sofort.
- **Von einer früheren (Env-basierten) Konfiguration umstellen:** Ältere
  Installationen hinterlegten Client-/Tenant-ID über Umgebungsvariablen
  (`ENTRA_CLIENT_ID`, `ENTRA_TENANT_ID`) bzw. `client/.env` (`VITE_ENTRA_*`).
  Diese werden weiterhin als **Fallback** gelesen, sind aber nicht mehr nötig.
  Empfohlenes Vorgehen:
  1. Die Werte im Admin-Bereich (Anmeldung (SSO)) eintragen und Verbindung testen.
  2. Anschließend die alten `ENTRA_*`- bzw. `VITE_ENTRA_*`-Einträge aus
     `/etc/essen-nigefa/essen-nigefa.env` und `client/.env` entfernen – ab dann
     ist die Datenbank-Konfiguration die alleinige Quelle.
- **Von Client-Secret auf Verbundanmeldung:** Diese App hat **nie** ein
  Client-Secret verwendet (der Benutzer-Login lief immer über PKCE). Wer in Azure
  noch ein Secret angelegt hatte, kann es gefahrlos **löschen** – für den Betrieb
  wird ausschließlich die Verbundanmeldeinformation benötigt.

## Relevante Azure-Portal-Ansichten (Kurzbeschreibung)

- **App-Registrierungen → (App) → Übersicht:** Hier stehen **Anwendungs-ID
  (Client)** und **Verzeichnis-ID (Mandant)** – die beiden GUIDs für den
  Admin-Bereich.
- **… → Authentifizierung:** Liste der **Plattformen**; unter
  „Single-Page-Anwendung" stehen die **Redirect-URIs**. Hier die Portal-Adresse
  eintragen. (Kein „Web"-Secret, keine „impliziten" Tokens erforderlich.)
- **… → Zertifikate & Geheimnisse → Verbundanmeldeinformationen:** Tabelle der
  Federated Credentials. Über **Anmeldeinformationen hinzufügen** das Szenario
  „Anderer Aussteller" wählen und **Issuer / Subject identifier / Audience**
  eintragen. Dass hier **kein Geheimnis** hinterlegt ist, ist der ganze Sinn der
  Sache.
- **Portal → Admin → Anmeldung (SSO):** Gegenstück auf App-Seite. Zeigt unten die
  exakt einzutragenden Azure-Werte für die eigene Installation und erlaubt
  „Verbindung testen".

## Optionen

- **Automatische Weiterleitung** (Admin-Schalter): Nutzer ohne Sitzung werden
  direkt zum Microsoft-Login geschickt, statt die Login-Seite mit Button zu
  zeigen. Die lokale Anmeldung bleibt über die direkte Adresse erreichbar.
- `ENTRA_AUTO_CREATE=0` (Server-Env): nur vorab angelegte Benutzer (Benutzername
  = E-Mail) dürfen sich per SSO anmelden.

## Fehlerbehebung

| Meldung / Symptom | Ursache & Lösung |
| --- | --- |
| `AADSTS50011` (Redirect-URI stimmt nicht) | Eingetragene SPA-Redirect-URI ≠ Portal-Origin. Exakt die Basis-Adresse ohne Pfad hinterlegen. |
| `AADSTS70021` (kein passender Federated-Identity-Datensatz) | Subject/Issuer/Audience im Admin-Bereich weichen von der Verbundanmeldung in Azure ab. |
| `AADSTS700016` (App nicht gefunden) | Falsche Client-ID oder falscher Tenant. |
| Verbindungstest: „nicht erreichbar" | Server hat keinen ausgehenden Internetzugang zu `login.microsoftonline.com`. |
| Entra ID erreicht Discovery/JWKS nicht | Portal-Basis-Adresse ist nicht öffentlich per HTTPS erreichbar – Issuer-URL entsprechend setzen. |
| Lokale Konten | Der Seed-Admin `admin` und andere lokale Konten funktionieren parallel weiter. Admin-Rechte für einen SSO-Benutzer vergibt man in der Benutzerverwaltung. |
