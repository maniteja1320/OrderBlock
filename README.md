# OrderBlock (local clone)

A full-stack recreation of the [OrderBlock](https://order-block.com) trading terminal for Indian F&O stocks — live strength rankings, order-block / liquidity charts, sector flow, market breadth, and a trading journal.

> Not affiliated with Options Oracle / order-block.com. Built from publicly described product behaviour and the published strength formula.

## Features

- **Landing, login, about, updates, disclosures, terms** pages
- **Live terminal** scanning 180+ NSE F&O equities via Yahoo Finance (`.NS`)
- **Bullish / Bearish boards** ranked by one-directional intraday strength
- **Market scatter, breadth bar, sector flow**
- **Popup charts** with order-block zones (Z) and S1 / R1 / R2 / liquidity levels
- **Trading journal** with P&L calendar heatmap (localStorage)
- **Light / dark theme**, mobile-friendly layout
- Auto-refresh every **60 seconds**

## Strength formula (disclosed method)

```
strength = today's one-directional move from the open ÷ average daily move
```

A score is non-zero only when travel on one side of the open is **more than 2×** the other side.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then go to **Terminal**.

First rankings load can take **30–90 seconds** while quotes are fetched in parallel.

## Notes

- Data source: Yahoo Finance public chart API (may be delayed; not an exchange feed).
- Guest login demo code: `1234`
- No broker credentials are ever requested.
- Not investment advice. Derivatives trading is high risk.
