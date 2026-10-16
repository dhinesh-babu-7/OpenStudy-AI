# Building OpenStudy AI with Open-Source AI

> Draft for the Hacktoberfest 2026 DEV Open-Source AI Challenge. Confirm the current challenge window and new-project eligibility before publishing. This project started from a React + Vite starter; do not claim eligibility unless its creation history meets the challenge rules.

I wanted to build a small study assistant that can explain a hard concept in plain language, offer examples, and help a learner practice with follow-up questions. The goal was not to wrap an AI API in a generic chat box, but to make the model choice and data flow understandable to someone learning full-stack development.

## What I built

OpenStudy AI is a React + Vite frontend backed by a small Express API. A learner can ask a question, continue with recent context, retry a failed request, and clear the conversation. The UI also explains that answers may be wrong and that prompts are sent to a hosted inference provider.

The backend uses OpenRouter's OpenAI-compatible chat-completions API. Its official catalog currently lists `openrouter/free` as the zero-priced Free Models Router; the router chooses from free models available at request time. The underlying model can change, and free-model rate limits and availability are not guaranteed. A specific catalog model ending in `:free` can be selected with `OPENROUTER_MODEL` instead.

## Why this stack

React and Vite keep the interface quick to iterate on. Express owns the OpenRouter request so the API key never enters browser code. The server validates inputs, limits payload size, applies an upstream timeout, and translates common provider failures into messages a learner can act on.

The local request path is simple: browser to `/api/chat`, Vite's development proxy to Express, and Express to OpenRouter. The frontend stores the current conversation only in page memory. The prompt and conversation context are transmitted to OpenRouter and the selected provider for inference.

## What worked and what did not

The main design choice that worked was keeping the provider boundary in one backend file. Switching between the OpenRouter free router and another catalog model does not require editing React, and the API key stays in `server/.env`.

This is hosted inference, not offline inference. It needs an OpenRouter API key and network access. The free router is listed at zero prompt/completion price, but free models can be rate limited or unavailable. Model choice, quality, and latency may change with router selection. I have not measured benchmark performance or claimed a successful real inference in this draft.

## Running it

On Windows, install Node.js 20.19+ and npm, then run `npm install`. Create an OpenRouter API key, set `OPENROUTER_API_KEY` in `server/.env`, keep `OPENROUTER_MODEL=openrouter/free`, and start `npm run server` and `npm run dev` in separate terminals. The app normally opens at `http://localhost:5173`; backend health is at `http://localhost:3000/api/health`.

Never commit the local `.env` file or publish the token. The project `.gitignore` excludes it.

## Why open-source AI matters here

An open-weight model gives builders and learners something inspectable: a model card, a published license, and the freedom to compare or replace models. Open provider integrations make it possible to change infrastructure without binding the frontend to one vendor. That openness does not make hosted inference private or free by default, so the app makes those limitations explicit instead of suggesting that the model runs locally.

The next useful improvements would be tests for provider error handling, a more capable answer renderer, and optional local inference support. Those are future ideas, not features in this implementation.

## Links to add before publishing

- Repository: [add the public repository URL]
- Live demo: [add a URL only if deployed]
- Screenshot: [add a real screenshot with no secrets or private prompts]
- Challenge page: [verify and link the current official challenge page]

Before publishing, re-check the OpenRouter model catalog, free-model rate limits, privacy terms, and the challenge's creation-date requirements.