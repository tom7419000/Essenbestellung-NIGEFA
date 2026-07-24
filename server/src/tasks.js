import './env.js';
import { initDb } from './db.js';
import { resolveOpenDays } from './dayLogic.js';
import { generateAutoPlan } from './autoPlan.js';
import { initPush } from './push.js';

// Wiederkehrende Wartung für EXTERNE Scheduler (z. B. Plesk „Zeitgesteuerte
// Aufgaben"). Unter Phusion Passenger kann die Web-App bei Inaktivität
// heruntergefahren werden, wodurch der interne setInterval-Timer pausiert.
// Dieser Task übernimmt dann verlässlich:
//   - Phasenübergänge ableiten (phase1 → phase2 → closed), Gewinner einfrieren,
//     Zufalls-/Fallback-Organisatoren zuweisen und Push-Hinweise verschicken
//   - fehlende Werktags-Tage automatisch anlegen (idempotent)
//
// Aufruf (siehe docs/plesk-installation.md):
//   node src/tasks.js
// Empfohlenes Intervall: alle 5–15 Minuten (für zeitnahe Phasenwechsel/Push).

async function run() {
  initDb();
  await initPush(); // Web Push auch im Cron-Prozess aktivieren (falls verfügbar)

  const plan = generateAutoPlan();
  resolveOpenDays();

  const stamp = new Date().toISOString();
  console.log(
    plan.created.length
      ? `[tasks ${stamp}] Auto-Tagesplanung: ${plan.created.length} Tag(e) erzeugt (${plan.created.join(', ')}).`
      : `[tasks ${stamp}] Auto-Tagesplanung: keine neuen Tage nötig.`
  );
  console.log(`[tasks ${stamp}] Phasenwechsel geprüft.`);

  // Ausstehende (fire-and-forget) Push-Sendungen flushen lassen; danach beendet
  // sich der Prozess von selbst. Sicherheitsnetz: harter Abbruch nach 15 s.
  setTimeout(() => process.exit(0), 15_000).unref();
}

run().catch((e) => {
  console.error('[tasks] Fehler:', e);
  process.exit(1);
});
