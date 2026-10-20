# Friend’s Fridge

A CS 409 final project about keeping track of groceries and sharing ingredients and recipes with friends.

## Project idea

Friend’s Fridge helps users remember what food they have and figure out what to make. Instead of entering every item manually, users will be able to upload photos of their fridge, groceries, or shopping receipts. The app will suggest ingredients, which users can review and correct before saving to their inventory.

Planned features:

- Personal accounts and ingredient inventories, with photo-based ingredient recognition.
- Food and drink recipes that users can browse, save, and share with friends.
- Friend requests and the ability to view friends’ shared ingredients.
- A private or friends-visible setting for each ingredient.
- Requests for small amounts of missing ingredients, which the owner can accept or decline.

For example, if you are making pancakes and need an egg, you could check whether a nearby friend has one to share. The goal is to make everyday cooking easier and more social while giving users control over what others can see.

## Proposal

[proposal](https://docs.google.com/document/d/1UlzD680KIkKY2jyNW98FWANaL8JMyS2eL-Badco_-6Q/edit?tab=t.0)

## Current status

The project currently has a working Hello World starter: a JavaScript frontend fetches `GET /api/hello` from a Node.js backend. The features above are planned and have not been implemented yet.

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

## Next steps

Add a database and authentication, implement photo recognition and the core inventory, recipe, and friend features, and build a responsive interface. We will also conduct a heuristic evaluation and complete at least one design revision.
