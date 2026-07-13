export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? 'nigefa',
    password: process.env.DB_PASSWORD ?? 'nigefa',
    name: process.env.DB_NAME ?? 'nigefa',
    synchronize: (process.env.DB_SYNCHRONIZE ?? 'true') === 'true',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '1025', 10),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
    from: process.env.MAIL_FROM ?? 'Essensbestellung <noreply@nigefa.de>',
  },
  schedulerEnabled: (process.env.SCHEDULER_ENABLED ?? 'true') === 'true',
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: process.env.VAPID_SUBJECT ?? 'mailto:kontakt@nigefa.de',
  },
});
