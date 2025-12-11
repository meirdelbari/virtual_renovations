# Deployment Guide for Virtual Renovations

This project is ready to be deployed to Vercel as a web application.

## Prerequisites

1.  **GitHub Account**: To host your code.
2.  **Vercel Account**: To deploy your application (sign up with GitHub).
3.  **API Keys**:
    *   `OPENAI_API_KEY` (from OpenAI)
    *   `GOOGLE_GEMINI_API_KEY` (from Google AI Studio)

## Step 1: Push to GitHub

If you haven't already pushed your code to GitHub:

1.  Create a new repository on GitHub (e.g., `virtual-renovations`).
2.  Run these commands in your terminal:

```bash
git add .
git commit -m "Prepare for Vercel deployment"
git branch -M main
# Replace <YOUR_USERNAME> and <REPO_NAME> with your details
git remote add origin https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
git push -u origin main
```

## Step 2: Deploy to Vercel

1.  Go to [Vercel Dashboard](https://vercel.com/dashboard).
2.  Click **"Add New..."** > **"Project"**.
3.  Import your `virtual-renovations` repository from GitHub.
4.  In the **Configure Project** screen:
    *   **Framework Preset**: Select "Other" (or leave as detected).
    *   **Root Directory**: Leave as `./`.
    *   **Environment Variables**: Expand this section and add:
        *   `OPENAI_API_KEY`: Your OpenAI API Key.
        *   `GOOGLE_GEMINI_API_KEY`: Your Google Gemini API Key.
5.  Click **Deploy**.

Vercel will build your project and assign a domain (e.g., `virtual-renovations.vercel.app`).

## Local Development

To run the application locally:

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Create a `.env` file in the root directory with your API keys:
    ```
    OPENAI_API_KEY=your_key_here
    GOOGLE_GEMINI_API_KEY=your_key_here
    ```
3.  Start the server:
    ```bash
    npm start
    ```
4.  Open `http://localhost:4000` in your browser.

## Project Structure

*   `api/`: Contains the backend logic (Serverless Functions).
*   `features/`: Frontend JavaScript modules.
*   `index.html`: Main entry point.
*   `vercel.json`: Vercel configuration.

