import { sequelize } from './config/database';
import './models';

sequelize.sync({ alter: false }).catch(() => { process.exitCode = 1; }).finally(() => sequelize.close());
