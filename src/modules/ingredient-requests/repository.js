import { randomUUID } from 'node:crypto';
import { inTransaction } from '../../db/connection.js';

export function ingredientRequestRepository(client, db) {
  const requests = db.collection('ingredient_requests');
  const inventory = db.collection('inventory_items');
  // actorId must come from the authenticated session, never a request body.
  return {
    async create(actorId, { owner_id, ingredient_id, quantity, message = '' }) {
      if (actorId === owner_id || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Invalid ingredient request');
      return inTransaction(client, async (session) => {
        const [low, high] = [actorId, owner_id].sort();
        const friend = await db.collection('friendships').findOne({ user_low_id: low, user_high_id: high, status: 'accepted' }, { session });
        if (!friend) throw new Error('Accepted friendship required');
        const item = await inventory.findOne({ user_id: owner_id, ingredient_id, visibility: 'friends', quantity: { $gte: quantity } }, { session });
        if (!item) throw new Error('Shared ingredient unavailable or insufficient stock');
        const now = new Date();
        const request = { _id: randomUUID(), requester_id: actorId, owner_id, ingredient_id, quantity, message, status: 'pending', created_at: now, updated_at: now };
        await requests.insertOne(request, { session });
        return request;
      });
    },
    async transition(actorId, requestId, nextStatus) {
      return inTransaction(client, async (session) => {
        const request = await requests.findOne({ _id: requestId }, { session });
        if (!request) throw new Error('Request not found');
        const isOwner = actorId === request.owner_id;
        const isRequester = actorId === request.requester_id;
        const allowed = (request.status === 'pending' && isOwner && ['accepted', 'declined'].includes(nextStatus))
          || (['pending', 'accepted'].includes(request.status) && (isOwner || isRequester) && nextStatus === 'cancelled')
          || (request.status === 'accepted' && isOwner && nextStatus === 'completed');
        if (!allowed) throw new Error('Forbidden request transition');
        const now = new Date();
        if (nextStatus === 'completed') {
          const result = await inventory.updateOne({ user_id: request.owner_id, ingredient_id: request.ingredient_id, quantity: { $gte: request.quantity } }, {
            $inc: { quantity: -request.quantity }, $set: { updated_at: now },
          }, { session });
          if (result.modifiedCount !== 1) throw new Error('Insufficient stock');
        }
        const result = await requests.findOneAndUpdate({ _id: requestId, status: request.status }, {
          $set: { status: nextStatus, updated_at: now },
        }, { session, returnDocument: 'after' });
        if (!result) throw new Error('Request state changed');
        return result;
      });
    },
  };
}
