# CS 409 Final Project

Minimal JavaScript frontend and backend starter. The browser fetches `GET /api/hello` and displays **Hello World**.

## Run locally

Requires Node.js 22 or newer. No dependencies need to be installed.

```sh
npm start
```

Open http://127.0.0.1:3000 in your browser. For automatic server restarts during development, use `npm run dev`.

To use another port: `PORT=3001 npm start`.

## Structure

- `server.js`: Node.js HTTP server, static frontend files, and JSON API.
- `public/index.html`: page markup.
- `public/app.js`: frontend API request and loading/error states.
- `public/styles.css`: responsive page styling.

## API

`GET /api/hello` returns:

```json
{ "message": "Hello World" }
```

## Remaining final-project requirements

This starter only verifies the frontend/API/backend connection. Next steps include choosing the application topic, assigning specific roles to 3–5 team members, adding a database and user authentication, building the application's REST resources, and conducting a heuristic evaluation followed by at least one design revision.
