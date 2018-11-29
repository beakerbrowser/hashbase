-- Up
CREATE TABLE activity (
  key INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  userid TEXT,
  username TEXT,
  action TEXT,
  params TEXT -- stores serialized JSON
);
CREATE INDEX activity_username_idx ON activity(username);
CREATE TABlE archives (
  key TEXT PRIMARY KEY,
  isFeatured INTEGER, -- flag

  -- stats
  diskUsage INTEGER DEFAULT 0,
  numBlocks INTEGER DEFAULT 0,
  numDownloadedBlocks INTEGER DEFAULT 0,
  numBytes INTEGER DEFAULT 0,
  numFiles INTEGER DEFAULT 0,

  updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
  createdAt INTEGER DEFAULT (strftime('%s', 'now'))
);
CREATE INDEX archives_createdAt_idx ON archives(createdAt);
CREATE TABLE reports (
  id INTEGER PRIMARY KEY,
  archiveKey TEXT NOT NULL,
  archiveOwner TEXT,
  reportingUser TEXT,

  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'open',
  notes TEXT,

  createdAt INTEGER DEFAULT (strftime('%s', 'now')),

  FOREIGN KEY (archiveKey) REFERENCES archives (key)
);
CREATE INDEX reports_archiveOwner_idx ON reports(archiveOwner);
CREATE INDEX reports_reportingUser_idx ON reports(reportingUser);
CREATE INDEX reports_archiveKey_idx ON reports(archiveKey);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  passwordHash TEXT,
  passwordSalt TEXT,

  email TEXT,
  profileURL TEXT,
  scopes TEXT, -- comma separated list
  suspension TEXT,

  plan TEXT DEFAULT 'basic',
  diskUsage INTEGER DEFAULT 0,

  diskQuota INTEGER,
  namedArchiveQuota INTEGER,

  isEmailVerified INTEGER DEFAULT 0,
  emailVerifyNonce TEXT,

  forgotPasswordNonce TEXT,

  isProfileDatVerified INTEGER DEFAULT 0,
  profileVerifyToken TEXT,

  stripeCustomerId TEXT,
  stripeSubscriptionId TEXT,
  stripeTokenId TEXT,
  stripeCardId TEXT,
  stripeCardBrand TEXT,
  stripeCardCountry TEXT,
  stripeCardCVCCheck TEXT,
  stripeCardExpMonth TEXT,
  stripeCardExpYear TEXT,
  stripeCardLast4 TEXT,

  updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
  createdAt INTEGER DEFAULT (strftime('%s', 'now'))
);
CREATE TABLE users_archives (
  userid TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT,

  FOREIGN KEY (userid) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (key) REFERENCES archives (key) ON DELETE CASCADE
);
CREATE UNIQUE INDEX users_archives_name_idx ON users_archives(name);

-- Down
DROP INDEX users_archives_name_idx;
DROP TABLE users_archives;
DROP TABLE users;
DROP INDEX reports_archiveOwner_idx;
DROP INDEX reports_reportingUser_idx;
DROP INDEX reports_archiveKey_idx;
DROP TABLE reports;
DROP INDEX archives_createdAt_idx;
DROP TABlE archives;
DROP INDEX activity_username_idx;
DROP TABLE activity;
