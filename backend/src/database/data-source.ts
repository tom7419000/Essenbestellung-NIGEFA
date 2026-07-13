import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './entities';

/**
 * DataSource für TypeORM-CLI (Migrationen) und Seeds.
 * Die Nest-App konfiguriert ihre Verbindung in app.module.ts mit denselben Werten.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'nigefa',
  password: process.env.DB_PASSWORD ?? 'nigefa',
  database: process.env.DB_NAME ?? 'nigefa',
  entities: ALL_ENTITIES,
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: (process.env.DB_SYNCHRONIZE ?? 'true') === 'true',
  logging: false,
});
