# Boutique

[![Netlify Status](https://api.netlify.com/api/v1/badges/2ead2bbb-3389-4725-bad6-76d179fe8e77/deploy-status)](https://app.netlify.com/projects/ggtecno/deploys)

Boutique is a simple e-commerce project split into a static frontend and an Express backend API.

## Project Layout

```text
Boutique/
  backend/          Express API, SQLite database setup, auth, orders, products
  frontend/public/  Static storefront and admin pages for Netlify
  data/             Local SQLite database files, ignored by git
  uploads/          Runtime product uploads, ignored by git
  netlify.toml      Netlify publish configuration for the frontend
```

## Run Locally

```bash
npm --prefix backend install
npm run seed
npm start
```

Open `.http://localhost:3000`

Demo accounts after seeding:

```text
Admin:    admin@luxeboutique.com / admin123
Customer: customer@example.com / customer123
```

## Deploy On Netlify

Netlify can deploy the static frontend directly from `frontend/public`.

The included `netlify.toml` already sets:

```toml
[build]
  publish = "frontend/public"
```

Important: the Express backend uses SQLite, uploads, cookies, and WebSockets, so it should be deployed on a backend host separately if you need the full shop API online. After the backend has a public URL, add a Netlify proxy or point the frontend/API routing to that backend.

## Notes

- The local backend serves `frontend/public`, so one local server is enough.
- Keep real secrets in `.env`; use `.env.example` only as a template.
- Runtime folders and dependency folders are ignored by git.
