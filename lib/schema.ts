import { z } from "zod";

const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "invalid ISO datetime");

export const CalendarEventPayload = z.object({
  external_id: z.string().min(1),
  title: z.string().min(1),
  starts_at: iso,
  ends_at: iso.nullish(),
  location: z.string().nullish(),
  raw: z.unknown().optional(),
});
export type CalendarEventPayload = z.infer<typeof CalendarEventPayload>;

export function parseCalendarEvents(input: unknown): CalendarEventPayload[] {
  return z.array(CalendarEventPayload).parse(input);
}
