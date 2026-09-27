-- Preserve what this application actually knew, without inventing an
-- earnings announcement date from a fiscal quarter-end or backdating it.
CREATE TABLE fundamentals_history (
  symbol TEXT NOT NULL,
  known_at TIMESTAMPTZ NOT NULL,
  facts JSONB NOT NULL,
  PRIMARY KEY (symbol, known_at)
);
ALTER TABLE fundamentals_history ENABLE ROW LEVEL SECURITY;

INSERT INTO fundamentals_history (symbol, known_at, facts)
SELECT symbol, updated_at, to_jsonb(fundamentals) FROM fundamentals;

CREATE FUNCTION archive_fundamentals() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO fundamentals_history VALUES (NEW.symbol, NEW.updated_at, to_jsonb(NEW));
  ELSIF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    INSERT INTO fundamentals_history VALUES (NEW.symbol, NEW.updated_at, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_fundamentals
AFTER INSERT OR UPDATE ON fundamentals
FOR EACH ROW EXECUTE FUNCTION archive_fundamentals();
