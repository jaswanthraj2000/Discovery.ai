# Discovery OS (medfly)

Evidence-backed biomedical literature search with clinical query expansion, evidence-tier ranking, treatment-setting alignment, and QTF × DIF therapeutic-frame matching.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/)

## Setup

```bash
cd medfly
pnpm install
cp .env.example .env
# Edit .env with your API keys (OpenAI and/or OpenRouter, Cohere and/or OpenRouter rerank)
```

## Development

```bash
pnpm dev
```

Open the URL printed in the terminal (typically `http://localhost:5173`). Try a therapeutic query at `/ask`, for example:

`first-line metastatic pancreatic cancer overall survival FDA-approved therapy`

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build |
| `pnpm test` | Run Vitest unit tests |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |

## Environment

See [`.env.example`](.env.example). At minimum, configure **one** expansion provider (`OPENAI_API_KEY` or `OPENROUTER_API_KEY`) and **one** rerank provider (`COHERE_API_KEY` or OpenRouter rerank via `OPENROUTER_API_KEY`).

Feature flags (defaults shown in `.env.example`):

- `ENABLE_EVIDENCE_TIER_RANKING` — tier → frame mismatch → setting → topical score
- `ENABLE_SETTING_STATE` / `SETTING_HARD_MISMATCH` — treatment-setting ranking
- `ABSTRACT_RESCORE_TOP_N` / `ABSTRACT_RESCORE_WEIGHT` — Europe PMC abstract rescore

## Deploy

Built for Cloudflare via TanStack Start. Configure secrets in Wrangler (`.dev.vars` locally, dashboard for production); do not commit `.env` or `.dev.vars`.

```bash
pnpm build
# Deploy with Wrangler per your Cloudflare project setup
```

## License

Private — add a license file if you open-source this repo.
