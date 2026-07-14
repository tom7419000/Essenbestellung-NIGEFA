# Speisekarten-Import

Admins können Speisekarten auf drei Wegen importieren (Restaurantverwaltung →
Restaurant auswählen): per **CSV-Datei**, von **Lieferando** oder von
**Gastromia**-basierten WebOrder-Seiten. Bei den URL-Importen wird das Ergebnis
vor dem Speichern als **Vorschau** angezeigt – einzelne Gerichte lassen sich
abwählen, Namen/Kategorien/Preise direkt korrigieren. Gespeichert wird wahlweise
**ergänzend** (gleichnamige Gerichte werden aktualisiert) oder **ersetzend**
(nicht mehr enthaltene Gerichte werden entfernt; bereits bestellte werden zum
Schutz der Historie nur deaktiviert).

## CSV-Import

Format (Kopfzeile erforderlich, Spaltenreihenfolge egal, nur „Name“ ist Pflicht):

```csv
Kategorie;Name;Beschreibung;Preis;Allergene
Pizza;Pizza Margherita;"Tomaten, Mozzarella, Basilikum";8,50;G
Salate;Gemischter Salat;Mit Balsamico-Dressing;7,20;
```

- Trennzeichen: Semikolon oder Komma (automatisch erkannt), UTF-8 (BOM ok)
- Preise: `8,50`, `8.50` oder mit €-Zeichen; leer = kein Preis
- Fehlerhafte Zeilen werden **übersprungen und mit Zeilennummer gemeldet**,
  gültige Zeilen werden trotzdem importiert
- Eine Beispiel-Vorlage gibt es als Download direkt in der Import-Karte

## Lieferando

URL der Restaurantseite eingeben, z. B.
`https://www.lieferando.de/speisekarte/<restaurant>`.

**Technischer Hintergrund:** Die Lieferando-Website lädt die Speisekarte
clientseitig aus einer internen JSON-API
(`cw-api.takeaway.com/api/<version>/restaurant?slug=…`). Der Import nutzt
diese API direkt (kein HTML-Parsing) und probiert mehrere API-Versionen durch.
Kategorien, Gerichte, Beschreibungen und Preise werden übernommen; Produkt-
Varianten werden zu eigenen Gerichten („Pizza Diavolo (groß)“).

Konfiguration (nur nötig, falls sich die API ändert):

| Umgebungsvariable | Standard | Zweck |
| --- | --- | --- |
| `LIEFERANDO_API_BASE` | `https://cw-api.takeaway.com/api` | Basis-URL der API |
| `LIEFERANDO_API_VERSIONS` | `v34,v33` | Versionen, die durchprobiert werden |

**Hinweis:** Die API ist inoffiziell. Wenn Lieferando das Format ändert oder
Server-Anfragen blockiert (HTTP 403), zeigt der Import eine entsprechende
Fehlermeldung – dann hilft ggf. ein späterer Versuch oder ein Update der App.

## Gastromia (weborder.gastromia.de)

URL der Bestellseite eingeben – entweder direkt
`https://weborder.gastromia.de/…` oder die eigene Restaurant-Domain, die die
Bestellstrecke einbindet (z. B. `https://www.ristorante-bar-europa.de/bestellung?orderMode=pickup`).
Die Erkennung erfolgt über die Domain bzw. den „Powered by GASTROMIA“-Hinweis
im Seitenquelltext.

**Technischer Hintergrund:** Gastromia-Seiten sind Next.js-Anwendungen, die
Kategorien und Artikel häufig clientseitig nachladen. Der Import versucht
deshalb drei Stufen, von der saubersten zur aufwendigsten:

1. **`__NEXT_DATA__`** im Seitenquelltext (bei serverseitig gerenderten Seiten
   liegt die Karte dort bereits als JSON),
2. **Next.js-Datenroute** `/_next/data/<buildId>/<pfad>.json` (liefert die
   Seitendaten als reines JSON),
3. **Headless-Rendering** (optional): Die Seite wird in einem unsichtbaren
   Chromium geladen und die JSON-Antworten der internen API werden abgefangen –
   das Äquivalent zum Blick in den Netzwerk-Tab der Browser-Devtools.

Da das Datenformat nicht öffentlich dokumentiert ist, arbeitet der Parser
strukturbasiert (erkennt Kategorie-/Gerichtslisten samt Preisfeldern in
verschiedenen Formen). Schlagen alle Stufen fehl, erscheint eine Fehlermeldung
mit den Details der einzelnen Stufen.

### Headless-Rendering aktivieren (optional)

Stufe 3 benötigt das npm-Paket `playwright` samt Chromium auf dem Server:

```bash
cd /opt/essen-nigefa/server
sudo -u essen npm install playwright
sudo -u essen npx playwright install --with-deps chromium
sudo systemctl restart essen-nigefa
```

Optional kann `MENU_IMPORT_CHROMIUM_PATH` auf ein vorhandenes
Chromium-Binary zeigen, dann entfällt der Browser-Download. Ohne Playwright
funktionieren die Stufen 1–2 weiterhin; die Vorschau weist dann darauf hin,
dass Headless-Rendering nicht verfügbar ist.

## Sicherheit & Grenzen

- Alle Import-Endpunkte sind **Administratoren vorbehalten**.
- Es werden nur öffentliche `http(s)`-Adressen abgerufen (Schutz vor Zugriffen
  auf interne Dienste); Weiterleitungsziele werden erneut geprüft.
- Externe Anbieter können automatisierte Zugriffe blockieren oder ihr Format
  ändern – der Import meldet das mit einer klaren Fehlermeldung, statt falsche
  Daten zu übernehmen. Die Vorschau ist bewusst der letzte Kontrollpunkt vor
  dem Speichern.
