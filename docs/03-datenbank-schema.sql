-- ============================================================================
-- NIGEFA Essensbestellung — PostgreSQL-Schema (PostgreSQL 16)
-- ----------------------------------------------------------------------------
-- Referenz-DDL. Im Betrieb erzeugt/migriert TypeORM das Schema
-- (Entities = Quelle der Wahrheit); dieses Skript dokumentiert den Zielzustand
-- und kann für eine manuelle Provisionierung genutzt werden.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('ADMIN', 'USER');

CREATE TYPE day_plan_status AS ENUM (
  'SCHEDULED',           -- angelegt, Abstimmung noch nicht offen
  'VOTING_OPEN',         -- Phase 1: Restaurant-Abstimmung läuft
  'RUNOFF_VOTING',       -- Stichwahl bei Gleichstand
  'TIE_ADMIN_DECISION',  -- Gleichstand, Admin muss entscheiden
  'ORDERING_OPEN',       -- Phase 2: Essensbestellung läuft
  'ORDERING_CLOSED',     -- Bestellfrist abgelaufen, Organisator übernimmt
  'ORDERED',             -- Organisator hat beim Restaurant bestellt
  'DELIVERED',           -- Essen geliefert
  'CANCELLED'            -- Tag abgesagt
);

CREATE TYPE tie_break_strategy AS ENUM ('RUNOFF', 'ADMIN_DECISION');

CREATE TYPE notification_type AS ENUM (
  'VOTING_OPENED',
  'VOTING_REMINDER',
  'RUNOFF_STARTED',
  'WINNER_ANNOUNCED',     -- = Start Phase 2
  'ORDERING_REMINDER',
  'TIE_ADMIN_ACTION',     -- Admin muss Gleichstand auflösen
  'ORGANIZER_REMINDER',   -- Bestellfrist vorbei → Organisator soll bestellen
  'ORDER_STATUS_CHANGED', -- ORDERED / DELIVERED
  'DAY_CANCELLED',
  'GENERIC'
);

-- ----------------------------------------------------------------------------
-- Benutzer & Authentifizierung
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                varchar(255) NOT NULL UNIQUE,
  password_hash        varchar(255) NOT NULL,
  first_name           varchar(100) NOT NULL,
  last_name            varchar(100) NOT NULL,
  role                 user_role    NOT NULL DEFAULT 'USER',
  locale               varchar(5)   NOT NULL DEFAULT 'de',      -- 'de' | 'en'
  is_active            boolean      NOT NULL DEFAULT true,
  email_notifications  boolean      NOT NULL DEFAULT true,
  push_notifications   boolean      NOT NULL DEFAULT false,
  is_anonymized        boolean      NOT NULL DEFAULT false,     -- DSGVO
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  varchar(128) NOT NULL UNIQUE,        -- SHA-256, nie im Klartext
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  keys        jsonb NOT NULL,                      -- { p256dh, auth }
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

-- ----------------------------------------------------------------------------
-- Restaurants & Speisekarten
-- ----------------------------------------------------------------------------
CREATE TABLE restaurants (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        varchar(200) NOT NULL,
  description text,
  cuisine     varchar(100),
  phone       varchar(50),
  website     varchar(500),
  menu_url    varchar(500),                        -- Quelle für Menü-Import
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE menu_items (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          varchar(200) NOT NULL,
  description   text,
  price         numeric(10,2) NOT NULL CHECK (price >= 0),
  category      varchar(100),                      -- z.B. Pizza, Salat, Getränk
  is_available  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_items_restaurant ON menu_items(restaurant_id);

-- ----------------------------------------------------------------------------
-- Tagesplanung
-- ----------------------------------------------------------------------------
CREATE TABLE day_plans (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  date                 date NOT NULL UNIQUE,
  status               day_plan_status NOT NULL DEFAULT 'SCHEDULED',
  vote_deadline        timestamptz NOT NULL,       -- Ende Phase 1
  order_deadline       timestamptz NOT NULL,       -- Ende Phase 2
  runoff_deadline      timestamptz,                -- gesetzt bei Stichwahl
  tie_break_strategy   tie_break_strategy NOT NULL DEFAULT 'RUNOFF',
  organizer_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  winner_restaurant_id uuid REFERENCES restaurants(id) ON DELETE SET NULL,
  organizer_note       text,                       -- Kommentar des Organisators
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_deadlines CHECK (order_deadline > vote_deadline)
);
CREATE INDEX idx_day_plans_status ON day_plans(status);

-- Restaurants, die an einem Tag zur Wahl stehen
CREATE TABLE day_plan_restaurants (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_plan_id         uuid NOT NULL REFERENCES day_plans(id) ON DELETE CASCADE,
  restaurant_id       uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  is_runoff_candidate boolean NOT NULL DEFAULT false,
  UNIQUE (day_plan_id, restaurant_id)
);

-- ----------------------------------------------------------------------------
-- Phase 1: Restaurant-Abstimmung
-- ----------------------------------------------------------------------------
CREATE TABLE restaurant_votes (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_plan_id    uuid NOT NULL REFERENCES day_plans(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id  uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  is_runoff_vote boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_plan_id, user_id, is_runoff_vote)    -- 1 Stimme je Wahlgang
);
CREATE INDEX idx_votes_day_plan ON restaurant_votes(day_plan_id);

-- ----------------------------------------------------------------------------
-- Phase 2: Essensbestellungen
-- ----------------------------------------------------------------------------
CREATE TABLE orders (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_plan_id    uuid NOT NULL REFERENCES day_plans(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  menu_item_id   uuid NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  quantity       int NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
  note           varchar(500),                     -- z.B. "ohne Zwiebeln"
  price_at_order numeric(10,2) NOT NULL,           -- Preis-Snapshot
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_plan_id, user_id, menu_item_id)
);
CREATE INDEX idx_orders_day_plan ON orders(day_plan_id);
CREATE INDEX idx_orders_user ON orders(user_id);

-- ----------------------------------------------------------------------------
-- Wochenvorlage (Tagesplanung je Wochentag)
-- ----------------------------------------------------------------------------
CREATE TABLE weekly_templates (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  weekday             int NOT NULL UNIQUE CHECK (weekday BETWEEN 0 AND 6), -- 0=So
  is_active           boolean NOT NULL DEFAULT true,
  organizer_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  vote_deadline_time  time NOT NULL DEFAULT '10:00',
  order_deadline_time time NOT NULL DEFAULT '11:30',
  tie_break_strategy  tie_break_strategy               -- NULL = globale Einstellung
);

CREATE TABLE weekly_template_restaurants (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  weekly_template_id uuid NOT NULL REFERENCES weekly_templates(id) ON DELETE CASCADE,
  restaurant_id      uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  UNIQUE (weekly_template_id, restaurant_id)
);

-- ----------------------------------------------------------------------------
-- Benachrichtigungen (In-App)
-- ----------------------------------------------------------------------------
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  title       varchar(200) NOT NULL,
  message     text NOT NULL,
  day_plan_id uuid REFERENCES day_plans(id) ON DELETE SET NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at);

-- ----------------------------------------------------------------------------
-- Audit-Log (Admin-Aktionen & Systementscheidungen)
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,  -- NULL = System
  action      varchar(100) NOT NULL,               -- z.B. 'dayplan.decideWinner'
  entity_type varchar(100) NOT NULL,
  entity_id   varchar(64),
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);

-- ----------------------------------------------------------------------------
-- Globale Einstellungen (Singleton, id = 1)
-- ----------------------------------------------------------------------------
CREATE TABLE app_settings (
  id                          int PRIMARY KEY CHECK (id = 1),
  vote_deadline_time          time NOT NULL DEFAULT '10:00',
  order_deadline_time         time NOT NULL DEFAULT '11:30',
  tie_break_strategy          tie_break_strategy NOT NULL DEFAULT 'RUNOFF',
  runoff_minutes              int NOT NULL DEFAULT 15 CHECK (runoff_minutes BETWEEN 5 AND 120),
  reminder_lead_minutes       int NOT NULL DEFAULT 30 CHECK (reminder_lead_minutes BETWEEN 5 AND 180),
  timezone                    varchar(64) NOT NULL DEFAULT 'Europe/Berlin',
  auto_generate_from_template boolean NOT NULL DEFAULT true,
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
