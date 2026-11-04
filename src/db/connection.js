import { MongoClient } from 'mongodb';
import { loadEnvFile } from 'node:process';

try { loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true';
  const name = process.env.MONGODB_DB || 'friends_fridge';
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db(name);
    await db.command({ ping: 1 });
    return { client, db };
  } catch (error) {
    await client.close();
    // Never print the connection URI, which may contain credentials.
    throw new Error(`MongoDB connection failed (${error.name}). Check MONGODB_URI and database availability.`);
  }
}

export async function inTransaction(client, operation) {
  const session = client.startSession();
  try {
    return await session.withTransaction(() => operation(session), {
      readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
    });
  } finally { await session.endSession(); }
}
