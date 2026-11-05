import { connectDatabase } from '../../src/db/connection.js';
import { initializeDatabase } from '../../src/db/schema.js';

const { client, db } = await connectDatabase();
try {
  await initializeDatabase(db);
  console.log(`Initialized collections, validators and indexes in ${db.databaseName}.`);
} finally { await client.close(); }
