import type { AnalyticsEvent, AnalyticsProps } from "@/domain/analytics/events";

export interface AnalyticsContext {
  anonymousId?: string;
  userId?: string;
}

export interface AnalyticsSink {
  readonly id: "console" | "posthog" | "none";
  track(event: AnalyticsEvent, props: AnalyticsProps, ctx?: AnalyticsContext): void;
}
