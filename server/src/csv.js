// Kleiner CSV-Parser ohne Zusatzabhängigkeit: unterstützt Anführungszeichen
// (inkl. ""-Escapes), CRLF und erkennt das Trennzeichen (Semikolon bevorzugt,
// da im deutschen Excel-Export üblich).

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons >= commas ? ';' : ',';
}

export function parseCsv(text) {
  const s = String(text).replace(/^\uFEFF/, ''); // BOM entfernen
  const delimiter = detectDelimiter(s);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// "8,50", "8.50", "1.234,56", "8,50 €" -> Cent (Integer); leer -> null; ungültig -> undefined
export function parsePriceToCents(raw) {
  let t = String(raw ?? '').replace(/€/g, '').trim();
  if (!t) return null;
  if (t.includes('.') && t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(',', '.');
  const value = Number.parseFloat(t);
  if (!Number.isFinite(value) || value < 0 || value > 10000) return undefined;
  return Math.round(value * 100);
}

// Schutz vor CSV-/Formel-Injection (N4). MUSS für JEDES künftige Exportieren
// von (nutzerkontrollierten) Werten in eine CSV verwendet werden: Beginnt ein
// Feld mit einem Steuerzeichen, das Tabellenkalkulationen als Formel
// interpretieren (= + - @, Tab, CR), wird ein Apostroph vorangestellt und der
// Wert bei Bedarf in Anführungszeichen gesetzt.
export function escapeCsvField(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";,\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const HEADER_ALIASES = {
  kategorie: 'category',
  category: 'category',
  name: 'name',
  gericht: 'name',
  beschreibung: 'description',
  description: 'description',
  preis: 'price',
  price: 'price',
  allergene: 'allergens',
  allergens: 'allergens',
  zusatzstoffe: 'allergens',
};

// CSV-Text -> { items, errors } gemäß Spaltenformat
// Kategorie;Name;Beschreibung;Preis;Allergene (Kopfzeile erforderlich,
// Reihenfolge egal, nur "Name" ist Pflicht). Fehlerhafte Zeilen werden
// gesammelt zurückgegeben, gültige Zeilen bleiben importierbar.
export function parseMenuCsv(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return { error: 'Die Datei ist leer.' };

  const header = rows[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] || null);
  if (!header.includes('name')) {
    return {
      error:
        'Kopfzeile nicht erkannt. Erwartet werden Spalten wie „Kategorie;Name;Beschreibung;Preis;Allergene“ (mindestens „Name“).',
    };
  }

  const items = [];
  const errors = [];
  const seenNames = new Set();

  rows.slice(1).forEach((cells, idx) => {
    const line = idx + 2; // 1-basiert inkl. Kopfzeile
    if (cells.every((c) => !String(c).trim())) return; // Leerzeile

    const record = {};
    header.forEach((key, col) => {
      if (key) record[key] = String(cells[col] ?? '').trim();
    });

    const name = (record.name || '').slice(0, 120);
    if (!name) {
      errors.push({ line, message: 'Spalte „Name“ ist leer.' });
      return;
    }
    if (seenNames.has(name.toLowerCase())) {
      errors.push({ line, message: `„${name}“ kommt in der Datei mehrfach vor – Zeile übersprungen.` });
      return;
    }
    const priceCents = parsePriceToCents(record.price);
    if (priceCents === undefined) {
      errors.push({ line, message: `Ungültiger Preis „${record.price}“ (erwartet z. B. 8,50).` });
      return;
    }

    seenNames.add(name.toLowerCase());
    items.push({
      name,
      description: (record.description || '').slice(0, 300),
      category: (record.category || '').slice(0, 60),
      allergens: (record.allergens || '').slice(0, 120),
      priceCents,
    });
  });

  return { items, errors };
}
