import type { AnalyticsEvent, AnalyticsProps } from "@/domain/analytics/events";
import type { AnalyticsContext, AnalyticsSink } from "./types";

export class ConsoleAnalytics implements AnalyticsSink {
  readonly id = "console" as const;
  track(event: AnalyticsEvent, props: AnalyticsProps, ctx?: AnalyticsContext): void {
    console.info(`📈 ${event}`, JSON.stringify({ ...props, anon: ctx?.anonymousId?.slice(0, 6) }));
  }
}

export class NoopAnalytics implements AnalyticsSink {
  readonly id = "none" as const;
  track(): void {}
}
