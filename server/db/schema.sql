-- Currency Safe — Postgres schema (B7)
-- Run once: psql $DATABASE_URL -f server/db/schema.sql

CREATE TABLE IF NOT EXISTS rooms (
    id VARCHAR(8) PRIMARY KEY,
    data JSONB NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'lobby',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_status_activity
    ON rooms (status, last_activity_at);

CREATE TABLE IF NOT EXISTS match_history (
    id BIGSERIAL PRIMARY KEY,
    room_id VARCHAR(8) NOT NULL,
    ended_at BIGINT NOT NULL,
    summary JSONB NOT NULL,
    full_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (room_id, ended_at)
);

CREATE INDEX IF NOT EXISTS idx_match_history_ended
    ON match_history (ended_at DESC);
