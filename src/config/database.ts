import { Sequelize } from 'sequelize';
import { env } from './env';

export const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: env.DB_SSL ? { ssl: { require: true, rejectUnauthorized: false } } : { ssl: false },
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
});

export async function verifyDatabaseConnection() {
  await sequelize.authenticate();
}
