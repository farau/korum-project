ALTER TABLE users
  ADD COLUMN display_name VARCHAR(32);

ALTER TABLE users
  ADD CONSTRAINT users_display_name_length CHECK (
    display_name IS NULL
    OR LENGTH(BTRIM(display_name)) BETWEEN 2 AND 32
  );
