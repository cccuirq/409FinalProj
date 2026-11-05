import { authService, ownUser } from './service.js';
import { friendshipService } from '../friendships/service.js';
import { HttpError, json, readJson, uuid, fields } from '../../utils/http.js';

export function userRoutes(client, db, { secureCookies = process.env.NODE_ENV === 'production', authLimit = 30 } = {}) {
  const auth = authService(client, db);
  const friends = friendshipService(db);
  const attempts = new Map();
  const cookie = (request) => request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('ff_session='))?.slice(11);
  const setCookie = (response, token) => response.setHeader('Set-Cookie', `ff_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? 604800 : 0}${secureCookies ? '; Secure' : ''}`);
  const page = (url) => {
    const skip = url.searchParams.get('offset') || '0';
    if (!/^\d{1,6}$/.test(skip)) throw new HttpError(400, 'INVALID_INPUT', 'Invalid offset.');
    return Number(skip);
  };
  return async (request, response, url) => {
    const path = url.pathname;
    if (!/^\/api\/(auth(?:\/|$)|users(?:\/|$)|friends(?:\/|$))/.test(path)) return false;
    if (!['GET', 'HEAD'].includes(request.method)) {
      const expected = `${secureCookies ? 'https' : 'http'}://${request.headers.host}`;
      if ((request.headers.origin && request.headers.origin !== expected) || request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'CROSS_ORIGIN', 'Cross-origin requests are not allowed.');
    }
    if (['/api/auth/register', '/api/auth/login'].includes(path) && request.method === 'POST') {
      const now = Date.now();
      for (const [key, record] of attempts) if (record.until <= now) attempts.delete(key);
      const ip = request.socket.remoteAddress;
      const record = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
      attempts.set(ip, record);
      if (++record.count > authLimit) { response.setHeader('Retry-After', Math.ceil((record.until - now) / 1000)); throw new HttpError(429, 'RATE_LIMIT', 'Too many login/register attempts. Try later.'); }
      const data = await readJson(request);
      const registering = path.endsWith('/register');
      const result = await auth[registering ? 'register' : 'login'](data, cookie(request));
      setCookie(response, result.token);
      json(response, registering ? 201 : 200, { data: result.user }); return true;
    }
    if (path === '/api/auth/logout' && request.method === 'POST') {
      await auth.logout(cookie(request)); setCookie(response, ''); json(response, 200, { data: { logged_out: true } }); return true;
    }
    const user = await auth.authenticate(cookie(request));
    const key = `${request.method} ${path}`;
    let data;
    if (key === 'GET /api/users/me') data = ownUser(user);
    else if (key === 'PATCH /api/users/me') data = await auth.updateProfile(user._id, await readJson(request));
    else if (key === 'GET /api/users') data = await auth.search(user._id, url.searchParams.get('q'), page(url));
    else if (key === 'GET /api/friends') data = await friends.list(user._id, 'accepted', null, page(url));
    else if (key === 'GET /api/friends/requests') {
      const direction = url.searchParams.get('direction') || 'incoming';
      if (!['incoming', 'outgoing'].includes(direction)) throw new HttpError(400, 'INVALID_INPUT', 'Invalid request direction.');
      data = await friends.list(user._id, 'pending', direction, page(url));
    } else if (key === 'POST /api/friends/requests') {
      const body = await readJson(request); fields(body, ['user_id']);
      data = await friends.request(user._id, uuid(body.user_id));
      json(response, 201, { data }); return true;
    } else if (request.method === 'PATCH' && /^\/api\/friends\/requests\/[^/]+$/.test(path)) {
      const body = await readJson(request); fields(body, ['status']);
      if (!['accepted', 'declined'].includes(body.status)) throw new HttpError(400, 'INVALID_INPUT', 'Status must be accepted or declined.');
      data = await friends.respond(user._id, uuid(path.split('/').pop()), body.status);
    } else if (request.method === 'DELETE' && /^\/api\/friends\/[^/]+$/.test(path)) data = await friends.remove(user._id, uuid(path.split('/').pop()));
    else throw new HttpError(404, 'NOT_FOUND', 'Endpoint not found.');
    json(response, 200, { data }); return true;
  };
}
