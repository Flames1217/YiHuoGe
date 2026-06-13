import dayjs from "dayjs";
import { Solar } from "lunar-javascript";
import type { Asset, CalendarItem, Language } from "../types";

export function lunarLabel(date: Date): string {
  try {
    const lunar = Solar.fromDate(date).getLunar();
    const month = lunar.getMonthInChinese();
    const day = lunar.getDayInChinese();
    const jieQi = lunar.getJieQi();
    return `${month}\u6708${day}${jieQi ? ` \u00b7 ${jieQi}` : ""}`;
  } catch {
    return "\u519c\u5386\u5f85\u8f7d\u5165";
  }
}

function zonedDate(now: Date, timezone: string): Date {
  try {
    return new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  } catch {
    return now;
  }
}

export function topbarDate(now = new Date(), language: Language = "zh", timezone = "Asia/Shanghai"): string {
  const current = zonedDate(now, timezone);
  const time = dayjs(current).format("HH:mm:ss");
  if (language === "zh") {
    const weekday = ["\u661f\u671f\u65e5", "\u661f\u671f\u4e00", "\u661f\u671f\u4e8c", "\u661f\u671f\u4e09", "\u661f\u671f\u56db", "\u661f\u671f\u4e94", "\u661f\u671f\u516d"][current.getDay()];
    return `${dayjs(current).format("YYYY-MM-DD")} ${weekday} ${time} \u00b7 ${lunarLabel(current)}`;
  }
  return `${dayjs(current).format("YYYY-MM-DD dddd HH:mm:ss")} · ${lunarLabel(current)}`;
}

export function daysUntil(date: string, cycle?: Asset["cycle"]): number {
  if (cycle === "lifetime") return Number.POSITIVE_INFINITY;
  return dayjs(date).startOf("day").diff(dayjs().startOf("day"), "day");
}

export function statusByDate(date: string, cycle?: Asset["cycle"]): Asset["status"] {
  if (cycle === "lifetime") return "healthy";
  const days = daysUntil(date);
  if (!Number.isFinite(days)) return "healthy";
  if (days < 0) return "expired";
  if (days <= 7) return "critical";
  if (days <= 30) return "warning";
  return "healthy";
}

export function monthMatrix(anchor: dayjs.Dayjs): dayjs.Dayjs[] {
  const start = anchor.startOf("month").startOf("week");
  return Array.from({ length: 42 }, (_, index) => start.add(index, "day"));
}

export function calendarItemsFromAssets(assets: Asset[]): CalendarItem[] {
  return assets.filter((asset) => asset.cycle !== "lifetime" && asset.renewalDate).map((asset) => ({
    id: `renew-${asset.id}`,
    title: asset.name,
    date: asset.renewalDate,
    kind: "renewal",
    assetId: asset.id,
  }));
}
