export interface DashboardSummary {
  id: string;
  name: string;
  description?: string | null;
  _count?: { widgets: number };
}

export interface Dashboard extends DashboardSummary {
  layout: string;
  widgets: Widget[];
}

export interface Widget {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
  data?: WidgetData;
}

export interface AnalyticsEvent {
  id: string;
  eventType: string;
  eventName: string;
  timestamp: string;
  properties: unknown;
}

export type WidgetData = number | { eventType: string; _count: number }[] | AnalyticsEvent[];
export interface DashboardDataResponse {
  dashboard: Dashboard;
  widgetData: { widgetId: string; data: WidgetData }[];
}
