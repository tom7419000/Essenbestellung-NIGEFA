// Gerichtsname mit vorangestellter Kategorie („Pizza – Nr. 12 Margherita"), damit
// mehrdeutige Namen („Klein", „Nr. 12") unterscheidbar sind. Ohne Kategorie (leer
// oder gelöschtes Gericht) bleibt nur der Name – kein führendes Trennzeichen.
// Trennzeichen bewusst „–" und nicht „·": Letzteres trennt in der App bereits
// Meta-Angaben (Preis, Wochentag, Status) und wäre hier mehrdeutig.
export default function ItemLabel({ item }) {
  const name = item?.itemName || 'Unbekanntes Gericht';
  const category = (item?.category || '').trim();
  if (!category) return <>{name}</>;
  return (
    <>
      <span className="item-category">{category} –</span> {name}
    </>
  );
}
