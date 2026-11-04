import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { connectDatabase } from '../../src/db/connection.js';

export const ingredients = [
  ['egg', 'protein', 'piece'], ['milk', 'dairy', 'ml'],
  ['flour', 'grain', 'g'], ['butter', 'dairy', 'g'],
  ['sugar', 'pantry', 'g'], ['salt', 'pantry', 'g'],
  ['rice', 'grain', 'g'], ['pasta', 'grain', 'g'],
  ['tomato', 'vegetable', 'g'], ['onion', 'vegetable', 'g'],
  ['garlic', 'vegetable', 'g'], ['potato', 'vegetable', 'g'],
  ['carrot', 'vegetable', 'g'], ['spinach', 'vegetable', 'g'],
  ['chicken', 'protein', 'g'], ['tofu', 'protein', 'g'],
  ['olive oil', 'pantry', 'ml'], ['water', 'drink', 'ml'],
  ['coffee', 'drink', 'g'], ['lemon', 'fruit', 'piece'],
];

export async function seedIngredients(db) {
  for (const [name, category, default_unit] of ingredients) {
    await db.collection('ingredients').updateOne({ name }, {
      $setOnInsert: { _id: randomUUID(), name, category, default_unit, fresh_interval: null, created_at: new Date() },
    }, { upsert: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { client, db } = await connectDatabase();
  try { await seedIngredients(db); console.log('Seeded 20 standard ingredients (existing records preserved).'); }
  finally { await client.close(); }
}
