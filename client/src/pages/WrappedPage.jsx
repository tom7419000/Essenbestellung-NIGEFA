import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { fmtDateLong, fmtPrice } from '../format.js';

// Jahresrückblick zum Durchklicken. Die Kartenfolge wird aus den Daten
// aufgebaut – fehlt eine Angabe (z. B. kein Lieblingsgericht, weil nichts
// bestellt wurde), entfällt die jeweilige Karte.
function buildSlides(data, displayName) {
  const { personal: p, global: g, period } = data;
  const zeitraum = period.value === 'gesamt' ? 'seit Beginn' : period.label;
  const slides = [];

  slides.push({
    tint: 'accent',
    eyebrow: `Dein Rückblick · ${zeitraum}`,
    figure: p.orderCount,
    caption: p.orderCount === 1 ? 'Bestellung' : 'Bestellungen',
    line: p.orderCount
      ? `Du warst an ${p.dayCount} ${p.dayCount === 1 ? 'Tag' : 'Tagen'} dabei, ${displayName}.`
      : 'In diesem Zeitraum hast du noch nichts bestellt.',
  });

  if (p.topItem) {
    slides.push({
      tint: 'blue',
      eyebrow: 'Dein Lieblingsgericht',
      figure: p.topItem.name,
      small: true,
      caption: p.topItem.category || null,
      line: `${p.topItem.count}× bestellt – öfter als alles andere.`,
    });
  }

  if (p.topRestaurant) {
    slides.push({
      tint: 'green',
      eyebrow: 'Dein Lieblingsrestaurant',
      figure: p.topRestaurant.name,
      small: true,
      line: `${p.topRestaurant.count}× hast du hier bestellt.`,
    });
  }

  if (p.itemCount > 0) {
    slides.push({
      tint: 'amber',
      eyebrow: 'Deine Bilanz',
      figure: fmtPrice(p.totalCents),
      line: `${p.itemCount} ${p.itemCount === 1 ? 'Gericht' : 'Gerichte'} insgesamt, davon ${
        p.distinctItems
      } ${p.distinctItems === 1 ? 'verschiedenes' : 'verschiedene'}.`,
    });
  }

  slides.push({
    tint: 'accent',
    eyebrow: `Das Portal · ${zeitraum}`,
    figure: g.orderCount,
    caption: g.orderCount === 1 ? 'Bestellung' : 'Bestellungen',
    line: g.orderCount
      ? `von ${g.participants} ${g.participants === 1 ? 'Person' : 'Personen'} an ${g.dayCount} ${
          g.dayCount === 1 ? 'Tag' : 'Tagen'
        }.`
      : 'In diesem Zeitraum wurde nichts bestellt.',
  });

  if (g.topItem) {
    slides.push({
      tint: 'blue',
      eyebrow: 'Beliebtestes Gericht',
      figure: g.topItem.name,
      small: true,
      caption: g.topItem.category || null,
      line: `${g.topItem.count}× über alle hinweg bestellt.`,
    });
  }

  if (g.topRestaurant) {
    slides.push({
      tint: 'green',
      eyebrow: 'Beliebtestes Restaurant',
      figure: g.topRestaurant.name,
      small: true,
      line: g.busiestDay
        ? `${g.topRestaurant.count} Bestellungen. Stärkster Tag: ${fmtDateLong(
            g.busiestDay.date
          )} mit ${g.busiestDay.count}.`
        : `${g.topRestaurant.count} Bestellungen.`,
    });
  }

  return slides;
}

export default function WrappedPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('');
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(async (value) => {
    try {
      const query = value ? `?zeitraum=${encodeURIComponent(value)}` : '';
      const d = await api(`/stats/wrapped${query}`);
      setData(d);
      setPeriod(d.period.value);
      setIndex(0);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const slides = data ? buildSlides(data, user.displayName) : [];

  useEffect(() => {
    if (slides.length === 0) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, slides.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [slides.length]);

  if (error) return <div className="alert">{error}</div>;
  if (!data) return <div className="page-loading">Lädt …</div>;

  const slide = slides[Math.min(index, slides.length - 1)];

  return (
    <div className="stack">
      <div className="card page-head">
        <div>
          <span className="eyebrow">Rückblick</span>
          <h1>Euer Essensjahr</h1>
          <p className="muted">
            Ausgewertet wird die vorhandene Bestellhistorie – stornierte Bestellungen zählen nicht
            mit.
          </p>
        </div>
        <label className="inline-select">
          Zeitraum
          <select value={period} onChange={(e) => load(e.target.value)}>
            {data.availablePeriods.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="wrapped-deck">
        <div className={`wrapped-slide tint-${slide.tint}`} role="group" aria-label={slide.eyebrow}>
          <span className="wrapped-eyebrow">{slide.eyebrow}</span>
          <div className={`wrapped-figure${slide.small ? ' small' : ''}`}>{slide.figure}</div>
          {slide.caption && <div className="wrapped-caption">{slide.caption}</div>}
          <p className="wrapped-line">{slide.line}</p>
        </div>

        <div className="wrapped-nav">
          <button
            className="btn btn-ghost"
            aria-label="Vorherige Karte"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <div className="wrapped-dots">
            {slides.map((s, i) => (
              <button
                key={s.eyebrow}
                type="button"
                className={`wrapped-dot${i === index ? ' active' : ''}`}
                aria-label={`Karte ${i + 1} von ${slides.length}: ${s.eyebrow}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <button
            className="btn btn-ghost"
            aria-label="Nächste Karte"
            disabled={index >= slides.length - 1}
            onClick={() => setIndex((i) => Math.min(i + 1, slides.length - 1))}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      </div>
    </div>
  );
}
