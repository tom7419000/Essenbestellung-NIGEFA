/**
 * Demodaten-Seed (idempotent):
 *   npm run seed            — lokal
 *   docker compose exec backend node dist/database/seeds/seed.js
 *
 * Legt an: Admin/Organisator/Benutzer, 3 Restaurants mit Speisekarten,
 * Wochenvorlage Mo–Fr, heutigen Tagesplan (Abstimmung offen, Fristen relativ
 * zu jetzt) sowie 3 vergangene Tage mit Stimmen/Bestellungen für Statistiken.
 */
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';
import { DataSource } from 'typeorm';
import { combineDateAndTime, todayInZone } from '../../common/utils/time.util';
import { AppDataSource } from '../data-source';
import {
  AppSetting,
  DayPlan,
  DayPlanRestaurant,
  DayPlanStatus,
  MenuItem,
  Order,
  Restaurant,
  RestaurantVote,
  Role,
  User,
  WeeklyTemplate,
  WeeklyTemplateRestaurant,
} from '../entities';

const TZ = 'Europe/Berlin';
const ROUNDS = 12;

async function ensureUser(
  ds: DataSource,
  email: string,
  firstName: string,
  lastName: string,
  role: Role,
  password: string,
): Promise<User> {
  const repo = ds.getRepository(User);
  let user = await repo.findOne({ where: { email } });
  if (!user) {
    user = repo.create({
      email,
      firstName,
      lastName,
      role,
      passwordHash: await bcrypt.hash(password, ROUNDS),
      locale: 'de',
    });
    await repo.save(user);
    console.log(`  Benutzer angelegt: ${email} (${role})`);
  }
  return user;
}

async function ensureRestaurant(
  ds: DataSource,
  name: string,
  data: Partial<Restaurant>,
  menu: { name: string; price: number; category: string; description?: string }[],
): Promise<Restaurant> {
  const repo = ds.getRepository(Restaurant);
  let restaurant = await repo.findOne({ where: { name } });
  if (!restaurant) {
    restaurant = repo.create({ name, ...data });
    await repo.save(restaurant);
    const itemsRepo = ds.getRepository(MenuItem);
    await itemsRepo.save(
      menu.map((item) =>
        itemsRepo.create({
          restaurantId: (restaurant as Restaurant).id,
          name: item.name,
          price: item.price,
          category: item.category,
          description: item.description ?? null,
        }),
      ),
    );
    console.log(`  Restaurant angelegt: ${name} (${menu.length} Gerichte)`);
  }
  return restaurant;
}

async function main(): Promise<void> {
  const ds = await AppDataSource.initialize();
  console.log('Seed startet …');

  // Einstellungen (Singleton)
  const settingsRepo = ds.getRepository(AppSetting);
  if (!(await settingsRepo.findOne({ where: { id: 1 } }))) {
    await settingsRepo.save(settingsRepo.create({ id: 1 }));
    console.log('  Einstellungen angelegt (Fristen 10:00/11:30, Stichwahl)');
  }

  // Benutzer
  const admin = await ensureUser(ds, 'admin@nigefa.de', 'Alex', 'Admin', Role.ADMIN, 'Admin123!');
  const orga = await ensureUser(ds, 'orga@nigefa.de', 'Olivia', 'Organisator', Role.USER, 'User123!');
  const max = await ensureUser(ds, 'max@nigefa.de', 'Max', 'Muster', Role.USER, 'User123!');
  const anna = await ensureUser(ds, 'anna@nigefa.de', 'Anna', 'Beispiel', Role.USER, 'User123!');

  // Restaurants + Speisekarten
  const roma = await ensureRestaurant(
    ds,
    'Pizzeria Roma',
    { cuisine: 'Italienisch', phone: '+49 30 1234561', description: 'Holzofenpizza & Pasta' },
    [
      { name: 'Pizza Margherita', price: 8.5, category: 'Pizza', description: 'Tomate, Mozzarella, Basilikum' },
      { name: 'Pizza Salami', price: 9.5, category: 'Pizza' },
      { name: 'Pizza Funghi', price: 9.0, category: 'Pizza', description: 'Champignons' },
      { name: 'Spaghetti Bolognese', price: 10.5, category: 'Pasta' },
      { name: 'Lasagne al Forno', price: 11.0, category: 'Pasta' },
      { name: 'Insalata Mista', price: 6.5, category: 'Salat' },
      { name: 'Tiramisu', price: 4.5, category: 'Dessert' },
    ],
  );
  const bowl = await ensureRestaurant(
    ds,
    'Green Bowl',
    { cuisine: 'Bowls & Salate', phone: '+49 30 1234562', description: 'Frisch, gesund, schnell' },
    [
      { name: 'Buddha Bowl', price: 11.5, category: 'Bowls', description: 'Quinoa, Avocado, Edamame' },
      { name: 'Chicken Teriyaki Bowl', price: 12.5, category: 'Bowls' },
      { name: 'Falafel Bowl', price: 10.5, category: 'Bowls' },
      { name: 'Caesar Salad', price: 9.5, category: 'Salate' },
      { name: 'Ofensüßkartoffel', price: 8.5, category: 'Warm' },
      { name: 'Fresh Lemonade', price: 3.5, category: 'Getränke' },
    ],
  );
  const sushi = await ensureRestaurant(
    ds,
    'Sushi Time',
    { cuisine: 'Japanisch', phone: '+49 30 1234563', description: 'Sushi & Bento-Boxen' },
    [
      { name: 'Sushi-Box Klein (8 Stk.)', price: 9.9, category: 'Sushi' },
      { name: 'Sushi-Box Groß (14 Stk.)', price: 15.9, category: 'Sushi' },
      { name: 'California Roll', price: 7.5, category: 'Sushi' },
      { name: 'Bento-Box Lachs', price: 13.9, category: 'Bento' },
      { name: 'Miso-Suppe', price: 3.9, category: 'Suppen' },
      { name: 'Edamame', price: 4.5, category: 'Vorspeisen' },
    ],
  );
  const restaurants = [roma, bowl, sushi];

  // Wochenvorlage Mo–Fr
  const templatesRepo = ds.getRepository(WeeklyTemplate);
  const templateRestaurantsRepo = ds.getRepository(WeeklyTemplateRestaurant);
  for (const weekday of [1, 2, 3, 4, 5]) {
    let template = await templatesRepo.findOne({ where: { weekday } });
    if (!template) {
      template = await templatesRepo.save(
        templatesRepo.create({
          weekday,
          isActive: true,
          organizerId: orga.id,
          voteDeadlineTime: '10:00',
          orderDeadlineTime: '11:30',
        }),
      );
      await templateRestaurantsRepo.save(
        restaurants.map((restaurant) =>
          templateRestaurantsRepo.create({
            weeklyTemplateId: (template as WeeklyTemplate).id,
            restaurantId: restaurant.id,
          }),
        ),
      );
    }
  }
  console.log('  Wochenvorlage Mo–Fr eingerichtet');

  const plansRepo = ds.getRepository(DayPlan);
  const optionsRepo = ds.getRepository(DayPlanRestaurant);
  const votesRepo = ds.getRepository(RestaurantVote);
  const ordersRepo = ds.getRepository(Order);
  const menuRepo = ds.getRepository(MenuItem);

  // Vergangene Tage (3 Werktage) mit Ergebnissen für Statistiken/Historie
  const today = todayInZone(TZ);
  const pastDates: string[] = [];
  let cursor = DateTime.fromISO(today, { zone: TZ }).minus({ days: 1 });
  while (pastDates.length < 3) {
    if (cursor.weekday <= 5) pastDates.push(cursor.toISODate() as string);
    cursor = cursor.minus({ days: 1 });
  }

  const winners = [roma, bowl, roma];
  const allUsers = [admin, orga, max, anna];
  for (const [index, date] of pastDates.entries()) {
    if (await plansRepo.findOne({ where: { date } })) continue;
    const winner = winners[index];
    const plan = await plansRepo.save(
      plansRepo.create({
        date,
        status: DayPlanStatus.DELIVERED,
        voteDeadline: combineDateAndTime(date, '10:00', TZ),
        orderDeadline: combineDateAndTime(date, '11:30', TZ),
        organizerId: orga.id,
        winnerRestaurantId: winner.id,
        organizerNote: index === 0 ? 'Lieferung war pünktlich um 12:15.' : null,
      }),
    );
    await optionsRepo.save(
      restaurants.map((restaurant) =>
        optionsRepo.create({ dayPlanId: plan.id, restaurantId: restaurant.id }),
      ),
    );
    await votesRepo.save(
      allUsers.map((user, userIndex) =>
        votesRepo.create({
          dayPlanId: plan.id,
          userId: user.id,
          restaurantId: userIndex < 3 ? winner.id : restaurants[(index + 1) % 3].id,
        }),
      ),
    );
    const menu = await menuRepo.find({ where: { restaurantId: winner.id } });
    await ordersRepo.save([
      ordersRepo.create({
        dayPlanId: plan.id,
        userId: max.id,
        menuItemId: menu[0].id,
        quantity: 1,
        priceAtOrder: menu[0].price,
        note: index === 0 ? 'ohne Zwiebeln' : null,
      }),
      ordersRepo.create({
        dayPlanId: plan.id,
        userId: anna.id,
        menuItemId: menu[1].id,
        quantity: 2,
        priceAtOrder: menu[1].price,
      }),
      ordersRepo.create({
        dayPlanId: plan.id,
        userId: orga.id,
        menuItemId: menu[2].id,
        quantity: 1,
        priceAtOrder: menu[2].price,
      }),
    ]);
    console.log(`  Vergangener Tag ${date}: ${winner.name}, 3 Bestellungen`);
  }

  // Heutiger Tagesplan: Abstimmung offen, Fristen relativ zu jetzt (Demo-freundlich)
  if (!(await plansRepo.findOne({ where: { date: today } }))) {
    const now = DateTime.now();
    const plan = await plansRepo.save(
      plansRepo.create({
        date: today,
        status: DayPlanStatus.VOTING_OPEN,
        voteDeadline: now.plus({ hours: 2 }).toJSDate(),
        orderDeadline: now.plus({ hours: 4 }).toJSDate(),
        organizerId: orga.id,
      }),
    );
    await optionsRepo.save(
      restaurants.map((restaurant) =>
        optionsRepo.create({ dayPlanId: plan.id, restaurantId: restaurant.id }),
      ),
    );
    await votesRepo.save([
      votesRepo.create({ dayPlanId: plan.id, userId: max.id, restaurantId: roma.id }),
      votesRepo.create({ dayPlanId: plan.id, userId: anna.id, restaurantId: bowl.id }),
    ]);
    console.log(
      `  Heutiger Plan (${today}): Abstimmung offen bis ${now.plus({ hours: 2 }).setZone(TZ).toFormat('HH:mm')} Uhr`,
    );
  }

  console.log('Seed abgeschlossen. Demo-Logins:');
  console.log('  admin@nigefa.de / Admin123!   (Administrator)');
  console.log('  orga@nigefa.de  / User123!    (Organisator heute)');
  console.log('  max@nigefa.de   / User123!    (Benutzer)');
  console.log('  anna@nigefa.de  / User123!    (Benutzer)');
  await ds.destroy();
}

main().catch((error) => {
  console.error('Seed fehlgeschlagen:', error);
  process.exit(1);
});
