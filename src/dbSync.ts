import { env } from './config/env';
import { sequelize } from './config/database';
import './models';

// The schema is built by supabase/migrations (see README). sync() only creates
// missing tables and model-named indexes - never columns, constraints, RLS or
// grants - so on a migrated database it adds duplicate indexes and on an empty
// one it leaves the migrations' constraints out. Local scratch databases only.
if (env.NODE_ENV === 'production') {
  console.error('Refusing to db:sync: NODE_ENV=production. Apply supabase/migrations instead.');
  process.exitCode = 1;
} else {
  sequelize.sync({ alter: false }).catch(() => { process.exitCode = 1; }).finally(() => sequelize.close());
}
