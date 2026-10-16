# OpenStudy AI

OpenStudy AI is a small, open-source study assistant for learners who want a patient explanation, a worked example, or practice questions on a topic. It uses OpenRouter's free-model router for chat completions. A working OpenRouter API key and an available free model are required for answers.

## Features

- Ask a question and continue with follow-up questions in the same conversation.
- Get explanations, examples, and practice questions from an instruction-tuned model.
- Choose Simple Explanation, Exam Answer, Step-by-Step, or Quick Summary for the answer style.
- Use suggested questions, Enter to submit, Shift+Enter for a newline, retry after errors, and clear the conversation.
- Keep the OpenRouter API key on the backend, with input limits, timeouts, and consistent API errors.
- Use OpenRouter's `openrouter/free` router by default, or configure another model through `OPENROUTER_MODEL`.

Example prompts: "Explain neural networks using a simple analogy", "Give me three practice questions about photosynthesis", or "Walk me through why this Python loop never ends".

AI can make mistakes. Check important facts and use this tool as a study aid, not as a substitute for course materials or professional advice.

## Model and Provider

The default is [`openrouter/free`](https://openrouter.ai/openrouter/free), OpenRouter's free-model router. Its official page documents the chat-completions API and says it selects a free model from those currently available on OpenRouter. The selected underlying model may change from request to request.

The backend uses OpenRouter's OpenAI-compatible endpoint: `https://openrouter.ai/api/v1/chat/completions`. OpenRouter's live model catalog listed `openrouter/free` at zero prompt and completion prices when checked on 2026-10-14. Free models can have tighter rate limits, change availability, or become temporarily unavailable; "free" does not guarantee unlimited requests or uninterrupted service. Check the live catalog for current models and limits.

To use a specific free model instead of the rotating router, find its exact `:free` model ID in the official catalog and set `OPENROUTER_MODEL` in `server/.env`. The API key stays server-side; never put it in a `VITE_` variable.

Official references:

- [OpenRouter model catalog](https://openrouter.ai/models)
- [OpenRouter free-model router and chat API](https://openrouter.ai/openrouter/free)
- [OpenRouter API reference](https://openrouter.ai/docs/api-reference/overview)
- [OpenRouter API key settings](https://openrouter.ai/settings/keys)

Each routed model has its own license and provider terms. Check the model page before relying on a particular model; OpenStudy AI does not pin the free router to one model.

## Architecture and Request Flow

1. React sends the current question, selected study mode, and recent conversation to the same-origin `/api/chat` route.
2. Vite proxies `/api` to the Express backend at `http://127.0.0.1:3000` during local development.
3. Express validates the body and selected study mode against a server-side allowlist, then adds the corresponding study-assistant instructions.
4. Express sends the messages and `OPENROUTER_API_KEY` to OpenRouter, then returns only the answer and selected model ID to the browser.

The browser never calls OpenRouter directly and never receives the API key. Conversations are held in the current page's React state and are cleared on reset or page reload. Questions and conversation context are sent to OpenRouter and the selected model provider to generate answers. Do not submit private, sensitive, or identifying information. The app does not claim to work offline or to keep prompts exclusively on your device.

## Windows Setup

Prerequisites: Node.js 20.19+ (or 22.12+) and npm. Node.js 24.11.1 is suitable.

From PowerShell in the project directory:

```powershell
npm install
if (-not (Test-Path .\server\.env)) { Copy-Item .\server\.env.example .\server\.env }
notepad .\server\.env
```

In Notepad, set `OPENROUTER_API_KEY` to an API key created at [OpenRouter key settings](https://openrouter.ai/settings/keys). Keep it only in `server/.env`; do not paste it into chat, source code, screenshots, or a `VITE_` variable. Keep `OPENROUTER_MODEL=openrouter/free` for the free-model router. `.env` files are ignored by Git. Save and close Notepad. If `server/.env` already exists, edit it; do not copy over it.

Start the backend in one PowerShell terminal:

```powershell
npm run server
```

Start the frontend in a second terminal:

```powershell
npm run dev
```

Open the Vite URL, normally [http://localhost:5173](http://localhost:5173). Check backend status at [http://localhost:3000/api/health](http://localhost:3000/api/health). The health response includes whether a token is configured and the selected model, but never returns the token.

To override settings, edit `server/.env`. `OPENROUTER_MODEL` changes the selected router/model; `PORT` changes the backend port; `CLIENT_ORIGIN` is a comma-separated list of allowed browser origins; `OPENROUTER_TIMEOUT_MS` sets the upstream timeout from 1,000 to 120,000 milliseconds. Existing `HF_TIMEOUT_MS` values are still accepted as a fallback. If `PORT` changes, update the Vite proxy target in `vite.config.js` too.

## Verify a Real Answer

1. Confirm `/api/health` returns `"status":"ok"` and `"inferenceConfigured":true`.
2. Ask a simple question in the app, such as "Explain the water cycle in three steps."
3. Confirm an answer appears, then ask a follow-up to check that context is carried forward.
4. Use **Clear conversation** and confirm the transcript disappears.
5. If the request fails, read the message in the app; it distinguishes missing setup, token permissions, provider billing/credits, rate limits, unavailable models, and timeouts.

This project does not include a test suite yet. The production frontend can be checked with `npm run build`; static linting uses `npm run lint`. A live AI check also depends on the user's token, network, model/provider availability, and any applicable account billing.

## Troubleshooting

- **Backend will not start:** use Node.js 20.19+ and run `npm install` from the project root.
- **`inferenceConfigured` is false:** ensure `server/.env` contains a non-empty `OPENROUTER_API_KEY` and restart `npm run server`.
- **API key rejected:** create or enable a key in OpenRouter settings and confirm it was copied into `server/.env` without quotes or extra spaces.
- **Rate limited:** wait and retry. Free models have stricter rate limits and may be temporarily unavailable.
- **Model unavailable:** check that `OPENROUTER_MODEL` is `openrouter/free` or an exact current `:free` model ID in the OpenRouter catalog.
- **Frontend cannot reach API:** start the backend first, then restart Vite. If you changed `PORT`, update `vite.config.js`.
- **CORS rejection:** use one of the configured local URLs or add the exact frontend origin to `CLIENT_ORIGIN`.

## Privacy and Limitations

- Questions and recent conversation turns leave the local app and go through OpenRouter to the selected model provider. Review the current privacy and data-retention terms for both services.
- There is no authentication, persistent conversation storage, rate limiting, or production deployment configuration in this local-development project. Do not expose the backend publicly without adding appropriate protections.
- Model responses may be incorrect, incomplete, or biased. Verify important information independently.
- Free models and providers may become unavailable, rotate, or change their rate limits. The `openrouter/free` router is currently listed at zero prompt/completion price, but free access is not unlimited or guaranteed.
- The backend currently provides text chat only; it does not upload files or browse the web.

## Screenshots

To capture screenshots, start both processes, open the app at the Vite URL, and use **Win+Shift+S**. Capture the empty study screen and a real answer after configuring a token. Do not include tokens, private questions, or account details. Save approved screenshots in `docs/images/` and link them here before publishing; no screenshots are claimed as existing yet.

## Open Innovation

OpenStudy AI puts an open-weight model at the center of a practical learning workflow. The model card and its terms are linked, the server-side integration is intentionally small and inspectable, and a model can be replaced with configuration rather than frontend changes. The provider is hosted rather than local, so this is not an offline-AI claim; keeping provider choice visible makes the tradeoffs around access, cost, and privacy easier to understand.

## Challenge Submission Note

The DEV Open-Source AI Challenge requires a project created during its challenge window. This workspace began from an existing React + Vite starter and has no Git history yet. Before submitting, confirm the challenge's current eligibility rules and preserve accurate repository creation history. This README does not claim that eligibility has been independently established.

## DEV.to Draft

See [`docs/DEVTO-DRAFT.md`](docs/DEVTO-DRAFT.md) for a submission draft. Verify challenge dates, repository eligibility, model/provider availability, and current inference pricing before publishing.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
