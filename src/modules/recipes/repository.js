import { inTransaction } from '../../db/connection.js';

export function recipeRepository(client, db) {
  return {
    async deleteOwned(actorId, recipeId) {
      return inTransaction(client, async (session) => {
        const deleted = await db.collection('recipes').deleteOne({ _id: recipeId, author_id: actorId }, { session });
        if (!deleted.deletedCount) throw new Error('Recipe not found or not owned');
        for (const name of ['recipe_ingredients', 'saved_recipes', 'recipe_shares']) {
          await db.collection(name).deleteMany({ recipe_id: recipeId }, { session });
        }
      });
    },
  };
}
