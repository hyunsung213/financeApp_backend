import { Sequelize } from 'sequelize';
import { env } from './env';

export const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  // Supabase signs its database certificates with its own root CA, so the
  // certificate can only be verified with DB_SSL_CA (required in production).
  dialectOptions: env.DB_SSL ? { ssl: env.DB_SSL_CA ? { require: true, rejectUnauthorized: true, ca: env.DB_SSL_CA } : { require: true, rejectUnauthorized: false } } : { ssl: false },
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
});

export async function verifyDatabaseConnection() {
  await sequelize.authenticate();
}
