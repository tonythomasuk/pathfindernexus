import * as Sentry from "@sentry/react";
import posthog from "posthog-js";

export const initAnalytics = () => {
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration(),
      ],
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });
  }

  if (import.meta.env.VITE_POSTHOG_API_KEY && import.meta.env.VITE_POSTHOG_HOST) {
    posthog.init(import.meta.env.VITE_POSTHOG_API_KEY, {
      api_host: import.meta.env.VITE_POSTHOG_HOST,
    });
  }
};
