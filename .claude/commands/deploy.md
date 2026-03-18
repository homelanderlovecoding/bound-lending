# /deploy

Build and deploy (or run locally).

## Usage
`/deploy [local|docker]`

## Local
```bash
docker-compose up -d          # MongoDB + Redis
cd be
cp .env.example .env          # edit as needed
npm install
npm run start:dev             # http://localhost:3000/docs
```

## Docker (full stack)
```bash
docker-compose up -d --build
```

## Verify
- Swagger: http://localhost:3000/docs
- Health: GET /api/price/btc
- Config: GET /api/config/lending
