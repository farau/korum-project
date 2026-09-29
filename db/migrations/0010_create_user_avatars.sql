-- Keep binary data out of normal profile queries. One bounded image per user.
CREATE TABLE user_avatars (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  image BYTEA NOT NULL,
  CONSTRAINT user_avatars_size CHECK (octet_length(image) BETWEEN 1 AND 102400)
);
