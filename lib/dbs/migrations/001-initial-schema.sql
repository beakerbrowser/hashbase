-- Up
CREATE TABLE activity (
  key INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  userid TEXT,
  username TEXT,
  action TEXT,
  params TEXT -- stores serialized JSON
);
CREATE TABlE archives (
  key TEXT PRIMARY KEY,
  isFeatured INTEGER, -- flag

  -- denormalized data
  -- TODO do we need this now that we have sqlite?
  name TEXT,
  ownerName TEXT,

  -- stats
  diskUsage INTEGER DEFAULT 0,
  numBlocks INTEGER DEFAULT 0,
  numDownloadedBlocks INTEGER DEFAULT 0,
  numBytes INTEGER DEFAULT 0,
  numFiles INTEGER DEFAULT 0,

  updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
  createdAt INTEGER DEFAULT (strftime('%s', 'now'))
);
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

-- Down
DROP TABLE activity;
DROP TABlE archives;
DROP TABLE reports;
DROP TABLE users;
