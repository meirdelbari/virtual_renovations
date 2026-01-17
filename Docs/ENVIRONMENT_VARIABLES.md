# Environment variables

Create a `.env` file in the **repo root** (do not commit it).

## Required (AlgoreitAI)

```
GOOGLE_GEMINI_API_KEY=AIzaSy_your_key_here
```

## Optional

### Server

```
PORT=4000
```

### OpenAI fallback (legacy)

```
OPENAI_API_KEY=sk_your_openai_key_here
```

### Clerk (auth)

The app exposes `/api/auth-config` and tries a few environment variable names.
If you use Clerk, set one of these:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
```

### Stripe (payments/credits)

If credits are enforced, Stripe secrets are required:

```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

