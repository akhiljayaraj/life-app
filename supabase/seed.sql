insert into calendar_events (user_id, source, external_id, title, starts_at, ends_at, location)
values ('00000000-0000-0000-0000-000000000001','gcal','seed-1','Standup',
        '2026-08-19T09:00:00Z','2026-08-19T09:15:00Z','Zoom');

insert into ingest_runs (user_id, source, started_at, finished_at, status, rows_written)
values ('00000000-0000-0000-0000-000000000001','gcal',
        '2026-08-19T06:00:00Z','2026-08-19T06:00:05Z','ok',1);
