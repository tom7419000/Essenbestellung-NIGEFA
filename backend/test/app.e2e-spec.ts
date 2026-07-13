/**
 * Integrationstest gegen echte PostgreSQL (siehe .github/workflows/ci.yml).
 * Lokal: docker compose up -d db  →  createdb nigefa_test  →  npm run test:e2e
 *
 * Alle Tagespläne liegen in der Zukunft und werden manuell geöffnet/geschlossen —
 * dadurch ist der Test unabhängig von der Tageszeit deterministisch.
 */
process.env.DB_NAME = process.env.DB_NAME ?? 'nigefa_test';
process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_SYNCHRONIZE = 'true';
process.env.SCHEDULER_ENABLED = 'false';
process.env.SMTP_HOST = '';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'e2e-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'e2e-refresh-secret';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

const api = '/api/v1';

describe('NIGEFA Essensbestellung — kompletter Tagesablauf (E2E)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  let adminToken: string;
  let mariaToken: string;
  let benToken: string;
  let mariaId: string;

  let romaId: string;
  let bowlId: string;
  let sushiId: string;
  let romaMenu: { id: string; name: string; price: number }[];

  const day = (offset: number) => DateTime.now().plus({ days: offset }).toISODate() as string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    http = app.getHttpServer();

    // Frische Datenbank je Testlauf
    const dataSource = app.get(DataSource);
    await dataSource.synchronize(true);
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('Registrierung: erster Benutzer wird ADMIN, weitere USER', async () => {
    const admin = await request(http)
      .post(`${api}/auth/register`)
      .send({ email: 'admin@nigefa.de', password: 'Admin123!', firstName: 'Alex', lastName: 'Admin' })
      .expect(201);
    expect(admin.body.user.role).toBe('ADMIN');
    adminToken = admin.body.accessToken;

    const maria = await request(http)
      .post(`${api}/auth/register`)
      .send({ email: 'maria@nigefa.de', password: 'User123!', firstName: 'Maria', lastName: 'Muster' })
      .expect(201);
    expect(maria.body.user.role).toBe('USER');
    mariaToken = maria.body.accessToken;
    mariaId = maria.body.user.id;

    const ben = await request(http)
      .post(`${api}/auth/register`)
      .send({ email: 'ben@nigefa.de', password: 'User123!', firstName: 'Ben', lastName: 'Beispiel' })
      .expect(201);
    benToken = ben.body.accessToken;
  });

  it('Login mit falschem Passwort scheitert; Refresh-Rotation funktioniert', async () => {
    await request(http)
      .post(`${api}/auth/login`)
      .send({ email: 'maria@nigefa.de', password: 'falsch' })
      .expect(401);

    const login = await request(http)
      .post(`${api}/auth/login`)
      .send({ email: 'maria@nigefa.de', password: 'User123!' })
      .expect(200);
    const refreshed = await request(http)
      .post(`${api}/auth/refresh`)
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    // alter Refresh-Token ist rotiert → zweiter Versuch scheitert
    await request(http)
      .post(`${api}/auth/refresh`)
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it('RBAC: Benutzer dürfen keine Restaurants anlegen, Admin schon', async () => {
    await request(http)
      .post(`${api}/restaurants`)
      .set(auth(mariaToken))
      .send({ name: 'Verboten' })
      .expect(403);

    const roma = await request(http)
      .post(`${api}/restaurants`)
      .set(auth(adminToken))
      .send({ name: 'Pizzeria Roma', cuisine: 'Italienisch', phone: '+49 30 12345' })
      .expect(201);
    romaId = roma.body.id;

    const bowl = await request(http)
      .post(`${api}/restaurants`)
      .set(auth(adminToken))
      .send({ name: 'Green Bowl', cuisine: 'Bowls' })
      .expect(201);
    bowlId = bowl.body.id;

    const sushi = await request(http)
      .post(`${api}/restaurants`)
      .set(auth(adminToken))
      .send({ name: 'Sushi Time', cuisine: 'Japanisch' })
      .expect(201);
    sushiId = sushi.body.id;

    for (const item of [
      { name: 'Pizza Margherita', price: 8.5, category: 'Pizza' },
      { name: 'Pizza Salami', price: 9.5, category: 'Pizza' },
      { name: 'Tiramisu', price: 4.5, category: 'Dessert' },
    ]) {
      await request(http)
        .post(`${api}/restaurants/${romaId}/menu-items`)
        .set(auth(adminToken))
        .send(item)
        .expect(201);
    }
    const detail = await request(http)
      .get(`${api}/restaurants/${romaId}`)
      .set(auth(mariaToken))
      .expect(200);
    romaMenu = detail.body.menuItems;
    expect(romaMenu).toHaveLength(3);
    expect(typeof romaMenu[0].price).toBe('number');
  });

  it('GET /day-plans/today → 404, solange kein Plan existiert', async () => {
    await request(http).get(`${api}/day-plans/today`).set(auth(mariaToken)).expect(404);
  });

  describe('Flow A — Abstimmung mit klarem Sieger, Bestellung, Organisator, Export', () => {
    let planId: string;

    it('Admin legt Tagesplan an (morgen), Organisatorin: Maria', async () => {
      const plan = await request(http)
        .post(`${api}/day-plans`)
        .set(auth(adminToken))
        .send({
          date: day(1),
          restaurantIds: [romaId, bowlId, sushiId],
          organizerId: mariaId,
          voteDeadlineTime: '10:00',
          orderDeadlineTime: '11:30',
        })
        .expect(201);
      planId = plan.body.id;
      expect(plan.body.status).toBe('SCHEDULED');
      expect(plan.body.options).toHaveLength(3);
    });

    it('Stimmen vor Öffnung werden abgewiesen (409)', async () => {
      await request(http)
        .put(`${api}/day-plans/${planId}/vote`)
        .set(auth(mariaToken))
        .send({ restaurantId: romaId })
        .expect(409);
    });

    it('Admin öffnet die Abstimmung manuell; alle stimmen ab (Roma 2 : Bowl 1)', async () => {
      const opened = await request(http)
        .post(`${api}/day-plans/${planId}/open-voting`)
        .set(auth(adminToken))
        .expect(201);
      expect(opened.body.status).toBe('VOTING_OPEN');

      const afterMaria = await request(http)
        .put(`${api}/day-plans/${planId}/vote`)
        .set(auth(mariaToken))
        .send({ restaurantId: romaId })
        .expect(200);
      expect(afterMaria.body.myVote).toEqual({ restaurantId: romaId });

      await request(http)
        .put(`${api}/day-plans/${planId}/vote`)
        .set(auth(benToken))
        .send({ restaurantId: bowlId })
        .expect(200);
      // Ben überlegt es sich anders → Upsert statt Duplikat
      await request(http)
        .put(`${api}/day-plans/${planId}/vote`)
        .set(auth(benToken))
        .send({ restaurantId: romaId })
        .expect(200);

      const afterAdmin = await request(http)
        .put(`${api}/day-plans/${planId}/vote`)
        .set(auth(adminToken))
        .send({ restaurantId: bowlId })
        .expect(200);
      expect(afterAdmin.body.totalVotes).toBe(3);
      const roma = afterAdmin.body.options.find(
        (option: { restaurantId: string }) => option.restaurantId === romaId,
      );
      expect(roma.voteCount).toBe(2);
    });

    it('Stimme für ein Restaurant außerhalb der Tagesauswahl → 400', async () => {
      await request(http)
        .put(`${api}/day-plans/${planId}/vote`)
        .set(auth(mariaToken))
        .send({ restaurantId: '00000000-0000-4000-8000-000000000000' })
        .expect(400);
    });

    it('Admin schließt die Abstimmung → Roma gewinnt, Phase 2 startet', async () => {
      const closed = await request(http)
        .post(`${api}/day-plans/${planId}/close-voting`)
        .set(auth(adminToken))
        .expect(201);
      expect(closed.body.status).toBe('ORDERING_OPEN');
      expect(closed.body.winnerRestaurant.id).toBe(romaId);
      expect(closed.body.winnerRestaurant.menuItems.length).toBeGreaterThan(0);
    });

    it('Alle Benutzer wurden über den Gewinner benachrichtigt (In-App)', async () => {
      const notifications = await request(http)
        .get(`${api}/notifications`)
        .set(auth(benToken))
        .expect(200);
      const types = notifications.body.items.map((n: { type: string }) => n.type);
      expect(types).toContain('WINNER_ANNOUNCED');
      expect(notifications.body.unreadCount).toBeGreaterThan(0);

      await request(http).post(`${api}/notifications/read-all`).set(auth(benToken)).expect(204);
      const after = await request(http)
        .get(`${api}/notifications`)
        .set(auth(benToken))
        .expect(200);
      expect(after.body.unreadCount).toBe(0);
    });

    it('Maria bestellt 2 Positionen mit Bemerkung; Ersetzen funktioniert', async () => {
      const margherita = romaMenu.find((item) => item.name === 'Pizza Margherita')!;
      const tiramisu = romaMenu.find((item) => item.name === 'Tiramisu')!;

      const orders = await request(http)
        .put(`${api}/day-plans/${planId}/my-orders`)
        .set(auth(mariaToken))
        .send({
          items: [
            { menuItemId: margherita.id, quantity: 1, note: 'ohne Zwiebeln' },
            { menuItemId: tiramisu.id, quantity: 2 },
          ],
        })
        .expect(200);
      expect(orders.body).toHaveLength(2);
      const margheritaLine = orders.body.find(
        (line: { menuItem: { name: string } }) => line.menuItem.name === 'Pizza Margherita',
      );
      expect(margheritaLine.note).toBe('ohne Zwiebeln');

      // komplettes Ersetzen: nur noch 1× Margherita
      const replaced = await request(http)
        .put(`${api}/day-plans/${planId}/my-orders`)
        .set(auth(mariaToken))
        .send({ items: [{ menuItemId: margherita.id, quantity: 1 }] })
        .expect(200);
      expect(replaced.body).toHaveLength(1);
      expect(replaced.body[0].priceAtOrder).toBe(8.5);
    });

    it('Gerichte fremder Restaurants können nicht bestellt werden (400)', async () => {
      // Menü-Item bei Green Bowl anlegen und im Roma-Plan bestellen
      const item = await request(http)
        .post(`${api}/restaurants/${bowlId}/menu-items`)
        .set(auth(adminToken))
        .send({ name: 'Buddha Bowl', price: 11.5 })
        .expect(201);
      await request(http)
        .put(`${api}/day-plans/${planId}/my-orders`)
        .set(auth(benToken))
        .send({ items: [{ menuItemId: item.body.id, quantity: 1 }] })
        .expect(400);
    });

    it('Zusammenfassung: nur Organisator/Admin (403 für andere)', async () => {
      await request(http)
        .get(`${api}/day-plans/${planId}/summary`)
        .set(auth(benToken))
        .expect(403);

      const summary = await request(http)
        .get(`${api}/day-plans/${planId}/summary`)
        .set(auth(mariaToken)) // Maria ist Organisatorin dieses Tages
        .expect(200);
      expect(summary.body.participantCount).toBe(1);
      expect(summary.body.grandTotal).toBe(8.5);
      expect(summary.body.byMenuItem[0].name).toBe('Pizza Margherita');
    });

    it('Bestellphase schließen, Organisatorin setzt Status auf ORDERED und DELIVERED', async () => {
      await request(http)
        .post(`${api}/day-plans/${planId}/close-ordering`)
        .set(auth(adminToken))
        .expect(201);

      const ordered = await request(http)
        .patch(`${api}/day-plans/${planId}/order-status`)
        .set(auth(mariaToken))
        .send({ status: 'ORDERED', note: 'Lieferung ca. 12:30' })
        .expect(200);
      expect(ordered.body.status).toBe('ORDERED');
      expect(ordered.body.organizerNote).toBe('Lieferung ca. 12:30');

      const delivered = await request(http)
        .patch(`${api}/day-plans/${planId}/order-status`)
        .set(auth(mariaToken))
        .send({ status: 'DELIVERED' })
        .expect(200);
      expect(delivered.body.status).toBe('DELIVERED');
    });

    it('Export liefert PDF und Excel mit korrekten Headern', async () => {
      const pdf = await request(http)
        .get(`${api}/day-plans/${planId}/export?format=pdf`)
        .set(auth(mariaToken))
        .expect(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(pdf.headers['content-disposition']).toContain('bestellung-');

      const xlsx = await request(http)
        .get(`${api}/day-plans/${planId}/export?format=xlsx`)
        .set(auth(adminToken))
        .expect(200);
      expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    });

    it('Historie zeigt Marias Bestellung', async () => {
      const history = await request(http)
        .get(`${api}/orders/my`)
        .set(auth(mariaToken))
        .expect(200);
      expect(history.body.total).toBe(1);
      expect(history.body.items[0].restaurantName).toBe('Pizzeria Roma');
      expect(history.body.items[0].total).toBe(8.5);
    });
  });

  describe('Flow B — Gleichstand mit Strategie ADMIN_DECISION', () => {
    let planId: string;

    it('Gleichstand führt zu TIE_ADMIN_DECISION', async () => {
      const plan = await request(http)
        .post(`${api}/day-plans`)
        .set(auth(adminToken))
        .send({
          date: day(2),
          restaurantIds: [romaId, bowlId],
          tieBreakStrategy: 'ADMIN_DECISION',
        })
        .expect(201);
      planId = plan.body.id;

      await request(http)
        .post(`${api}/day-plans/${planId}/open-voting`)
        .set(auth(adminToken))
        .expect(201);
      await request(http)
        .put(`${api}/day-plans/${planId}/vote`)
        .set(auth(mariaToken))
        .send({ restaurantId: romaId })
        .expect(200);
      await request(http)
        .put(`${api}/day-plans/${planId}/vote`)
        .set(auth(benToken))
        .send({ restaurantId: bowlId })
        .expect(200);

      const closed = await request(http)
        .post(`${api}/day-plans/${planId}/close-voting`)
        .set(auth(adminToken))
        .expect(201);
      expect(closed.body.status).toBe('TIE_ADMIN_DECISION');
    });

    it('Bestellversuch während TIE_ADMIN_DECISION → 409', async () => {
      await request(http)
        .put(`${api}/day-plans/${planId}/my-orders`)
        .set(auth(mariaToken))
        .send({ items: [] })
        .expect(409);
    });

    it('Admin entscheidet den Gleichstand → Phase 2 startet', async () => {
      const decided = await request(http)
        .post(`${api}/day-plans/${planId}/decide-winner`)
        .set(auth(adminToken))
        .send({ restaurantId: bowlId })
        .expect(201);
      expect(decided.body.status).toBe('ORDERING_OPEN');
      expect(decided.body.winnerRestaurant.id).toBe(bowlId);
    });
  });

  describe('Flow C — Gleichstand mit Strategie RUNOFF (Stichwahl)', () => {
    let planId: string;

    it('Gleichstand startet die Stichwahl mit den punktgleichen Kandidaten', async () => {
      const plan = await request(http)
        .post(`${api}/day-plans`)
        .set(auth(adminToken))
        .send({
          date: day(3),
          restaurantIds: [romaId, bowlId, sushiId],
          tieBreakStrategy: 'RUNOFF',
        })
        .expect(201);
      planId = plan.body.id;

      await request(http)
        .post(`${api}/day-plans/${planId}/open-voting`)
        .set(auth(adminToken))
        .expect(201);
      await request(http)
        .put(`${api}/day-plans/${planId}/vote`)
        .set(auth(mariaToken))
        .send({ restaurantId: romaId })
        .expect(200);
      await request(http)
        .put(`${api}/day-plans/${planId}/vote`)
        .set(auth(benToken))
        .send({ restaurantId: bowlId })
        .expect(200);

      const closed = await request(http)
        .post(`${api}/day-plans/${planId}/close-voting`)
        .set(auth(adminToken))
        .expect(201);
      expect(closed.body.status).toBe('RUNOFF_VOTING');
      expect(closed.body.runoffDeadline).toBeTruthy();
      const candidates = closed.body.options.filter(
        (option: { isRunoffCandidate: boolean }) => option.isRunoffCandidate,
      );
      expect(candidates).toHaveLength(2);
      // Sushi (0 Stimmen) ist NICHT in der Stichwahl
      expect(
        candidates.map((option: { restaurantId: string }) => option.restaurantId).sort(),
      ).toEqual([romaId, bowlId].sort());
    });

    it('In der Stichwahl sind nur Kandidaten wählbar; Stimme zählt als Runoff-Stimme', async () => {
      await request(http)
        .put(`${api}/day-plans/${planId}/vote`)
        .set(auth(mariaToken))
        .send({ restaurantId: sushiId })
        .expect(400);

      const voted = await request(http)
        .put(`${api}/day-plans/${planId}/vote`)
        .set(auth(mariaToken))
        .send({ restaurantId: bowlId })
        .expect(200);
      expect(voted.body.myRunoffVote).toEqual({ restaurantId: bowlId });
      expect(voted.body.myVote).toEqual({ restaurantId: romaId }); // Hauptwahl bleibt erhalten
    });
  });

  describe('Verwaltung: Wochenvorlage, Einstellungen, Benutzer, Audit', () => {
    it('Wochenvorlage anlegen und Plan daraus generieren', async () => {
      const targetWeekday = DateTime.now().plus({ days: 7 }).weekday % 7;
      await request(http)
        .put(`${api}/weekly-templates/${targetWeekday}`)
        .set(auth(adminToken))
        .send({
          isActive: true,
          restaurantIds: [romaId, bowlId],
          voteDeadlineTime: '09:30',
          orderDeadlineTime: '11:00',
        })
        .expect(200);

      const generated = await request(http)
        .post(`${api}/day-plans/generate`)
        .set(auth(adminToken))
        .send({ date: day(7) })
        .expect(201);
      expect(generated.body.options).toHaveLength(2);
      expect(generated.body.status).toBe('SCHEDULED');
    });

    it('Einstellungen: Admin kann Fristen und Strategie ändern', async () => {
      await request(http).get(`${api}/settings`).set(auth(mariaToken)).expect(403);
      const updated = await request(http)
        .patch(`${api}/settings`)
        .set(auth(adminToken))
        .send({ runoffMinutes: 20, tieBreakStrategy: 'ADMIN_DECISION' })
        .expect(200);
      expect(updated.body.runoffMinutes).toBe(20);
    });

    it('DSGVO: gelöschter Benutzer wird anonymisiert und ausgesperrt', async () => {
      const created = await request(http)
        .post(`${api}/users`)
        .set(auth(adminToken))
        .send({
          email: 'temp@nigefa.de',
          firstName: 'Temp',
          lastName: 'User',
          password: 'Temp1234',
        })
        .expect(201);

      await request(http)
        .delete(`${api}/users/${created.body.id}`)
        .set(auth(adminToken))
        .expect(204);

      await request(http)
        .post(`${api}/auth/login`)
        .send({ email: 'temp@nigefa.de', password: 'Temp1234' })
        .expect(401);

      const list = await request(http)
        .get(`${api}/users?search=anonym`)
        .set(auth(adminToken))
        .expect(200);
      expect(
        list.body.items.some((user: { email: string }) => user.email.includes('anonym.local')),
      ).toBe(true);
    });

    it('Audit-Log protokolliert Admin-Aktionen', async () => {
      const audit = await request(http)
        .get(`${api}/audit-logs?limit=50`)
        .set(auth(adminToken))
        .expect(200);
      const actions = audit.body.items.map((entry: { action: string }) => entry.action);
      expect(actions).toContain('dayplan.decideWinner');
      expect(actions).toContain('user.anonymize');
      expect(actions).toContain('settings.update');
      // Benutzer ohne Admin-Rolle: kein Zugriff
      await request(http).get(`${api}/audit-logs`).set(auth(benToken)).expect(403);
    });

    it('Dashboard liefert Kennzahlen', async () => {
      const stats = await request(http)
        .get(`${api}/stats/dashboard?days=30`)
        .set(auth(adminToken))
        .expect(200);
      expect(stats.body.totalUsers).toBeGreaterThanOrEqual(3);
      // Die Testpläne liegen in der Zukunft — das Dashboard wertet die
      // Vergangenheit aus; hier zählt, dass die Aggregationen fehlerfrei laufen.
      expect(Array.isArray(stats.body.topRestaurants)).toBe(true);
      expect(Array.isArray(stats.body.ordersPerDay)).toBe(true);
      expect(stats.body).toHaveProperty('participationRate');
    });

    it('Health-Endpoint ist öffentlich', async () => {
      const health = await request(http).get(`${api}/health`).expect(200);
      expect(health.body.db).toBe('up');
    });
  });
});
