import { app } from './app';
import { env } from './config/env';
import { sequelize, verifyDatabaseConnection } from './config/database';

let server: ReturnType<typeof app.listen>;
const shutdown = async () => { server?.close(); await sequelize.close(); process.exit(0); };
async function start() { await verifyDatabaseConnection(); server = app.listen(env.PORT, '0.0.0.0'); }
start().catch(() => { process.exitCode = 1; });
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
