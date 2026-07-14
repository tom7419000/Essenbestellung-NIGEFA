# Seitenkonzept

Single-Page-App (React + React Router). Alle Seiten außer `/login` erfordern eine
Anmeldung; die Admin-Seiten zusätzlich die Rolle `admin`. Das Layout ist responsiv
(Karten-Grid auf dem Desktop, gestapelte Karten und scrollbare Navigation auf Mobilgeräten).

## Navigationsstruktur

```
/login                     Anmeldung
/                          Heute (Dashboard, Phase 1 / Phase 2 / Abschluss)
/meine-bestellungen        Eigene Bestellhistorie
/organisation              Organisator-Ansicht (Bestellübersicht + Statusverwaltung)
/admin/tage                Tagesplanung (Admin)
/admin/restaurants         Restaurants & Speisekarten (Admin)
/admin/benutzer            Benutzerverwaltung (Admin)
```

Die Navigation blendet Einträge rollenabhängig ein: „Organisation“ sehen Admins immer
und Benutzer nur, wenn sie für mindestens einen Tag als Organisator eingetragen sind.

## Seiten im Detail

### Anmeldung (`/login`)
Zentrierte Karte mit Benutzername/Passwort. Fehlermeldungen inline (z. B. „Ungültige
Zugangsdaten“). Nach Anmeldung Weiterleitung auf „Heute“.

### Heute (`/`) – das Herzstück
Kopfkarte mit Datum, Phasen-Badge, Organisator des Tages und **Live-Countdown** bis zur
jeweils aktiven Deadline. Die Seite aktualisiert sich alle 15 Sekunden automatisch und
lädt beim Ablauf des Countdowns sofort neu, sodass der Phasenwechsel ohne manuelles
Neuladen sichtbar wird. Inhalt je nach Phase:

* **Phase 1 – Restaurantwahl:** Karten aller wählbaren Restaurants mit Beschreibung und
  Live-Stimmenzahl (🏆 markiert den aktuellen Spitzenreiter). Ein Klick stimmt ab, ein
  erneuter Klick auf die eigene Wahl zieht die Stimme zurück; bis zur Deadline änderbar.
* **Phase 2 – Essensauswahl:** Gewinner-Banner (Name, Stimmen, Telefon, Speisekarten-Link),
  darunter die Speisekarte als Radioliste mit Preisen, ein Bemerkungsfeld
  („ohne Zwiebeln …“) und Buttons zum Bestellen/Ändern/Löschen der eigenen Bestellung.
* **Abgeschlossen:** Zusammenfassung der eigenen Bestellung inkl. Status sowie die
  Gesamtzahl der Bestellungen.
* Ist kein Tag geplant, erscheint ein freundlicher Leerzustand.

### Meine Bestellungen (`/meine-bestellungen`)
Tabelle der eigenen Bestellungen (Datum, Restaurant, Gericht, Bemerkung, Preis,
Status-Badge) – die persönliche Historie.

### Organisation (`/organisation`)
Für den Tages-Organisator und Admins. Tagesauswahl (Standard: heute), dann:

* **Sammelbestellung:** nach Gericht gruppierte Übersicht mit Anzahl, Einzelpreis und
  Summe – ideal zum Durchgeben der Bestellung ans Restaurant. Stornierte Bestellungen
  werden nicht mitgezählt.
* **Einzelbestellungen:** Tabelle mit Name, Gericht, Bemerkung und Status-Dropdown je
  Bestellung (Eingegangen → Bestellt → Geliefert, Storniert) plus Sammelaktionen
  („Alle auf Bestellt/Geliefert“).
* **Abstimmungsergebnis** des Tages.
* Läuft Phase 2 noch, weist ein Hinweis darauf hin, dass sich die Liste noch ändern kann;
  die Ansicht aktualisiert sich alle 15 Sekunden.

### Tagesplanung (`/admin/tage`)
* Formular „Neuen Tag planen“: Datum, Organisator (Dropdown), Ende Phase 1 und Phase 2
  (Zeitfelder, vorbelegt mit den Standardzeiten), Restaurant-Checkboxen.
* Tabelle aller geplanten Tage mit Status, Deadlines, Organisator, Gewinner, Stimmen-
  und Bestellzahlen; je Zeile **Details** (Abstimmungsergebnis + alle Bestellungen =
  Ergebnisansicht für Admins), **Bearbeiten** und **Löschen**.
* Karte „Standard-Abstimmungszeiten“ zur Konfiguration der Vorbelegung.

### Restaurants (`/admin/restaurants`)
Zweispaltig: links Restaurantliste und Formular „Neues Restaurant“, rechts der Editor des
ausgewählten Restaurants (Stammdaten, aktiv/inaktiv) mit Speisekartenverwaltung
(Gerichte anlegen, bearbeiten, deaktivieren/löschen; Preiseingabe im Format „8,50“).

### Benutzer (`/admin/benutzer`)
Tabelle aller Benutzer mit Inline-Bearbeitung (Anzeigename, Rolle, aktiv/deaktiviert,
Passwort zurücksetzen) und Formular zum Anlegen. Schutzmechanismen: Das eigene
Admin-Konto kann nicht herabgestuft, deaktiviert oder gelöscht werden.

## Rollen und Berechtigungen

| Aktion | Benutzer | Organisator (des Tages) | Admin |
| --- | :-: | :-: | :-: |
| Anmelden, Abstimmen, Bestellen, eigene Historie | ✅ | ✅ | ✅ |
| Alle Bestellungen des Tages sehen | – | ✅ | ✅ |
| Bestellstatus verwalten (einzeln + Sammelaktion) | – | ✅ | ✅ |
| Benutzer / Restaurants / Tagesplanung / Zeiten / Ergebnisse | – | – | ✅ |

Der Organisator ist ein normaler Benutzer, der in der Tagesplanung für einen bestimmten
Tag eingetragen wird – die Berechtigung gilt genau für diesen Tag.
