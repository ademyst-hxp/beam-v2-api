import dotenv from 'dotenv';
dotenv.config({ quiet: true, override: true });

import { db } from './index.js';

console.log('Creating table Logins');
await db.run(`CREATE TABLE Logins (
    id              TEXT UNIQUE NOT NULL PRIMARY KEY,
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    email           TEXT UNIQUE NOT NULL
)`);

console.log('Creating table Sessions');
await db.run(`CREATE TABLE Sessions (
    id              TEXT UNIQUE NOT NULL PRIMARY KEY,
    token           TEXT NOT NULL,
    account         TEXT NOT NULL,
    last_activity   DATE NOT NULL,
    ip              TEXT NOT NULL,

    FOREIGN KEY (account) REFERENCES Logins(id)
)`);

console.log('Creating table Users');
await db.run(`CREATE TABLE Users (
    id              TEXT UNIQUE NOT NULL PRIMARY KEY,
	name            TEXT UNIQUE NOT NULL,
	display_name    TEXT,
	pronouns        TEXT,
	birthday        DATE,
	account_type    TEXT,
	description     TEXT,
	status          TEXT,

	creation_date   DATE NOT NULL,
	update_date     DATE NOT NULL,

	level           INTEGER NOT NULL DEFAULT 3,
	flags           TEXT[] NOT NULL DEFAULT '{}',

    FOREIGN KEY (id) REFERENCES Logins(id)
)`);

console.log('Creating table Relations');
await db.run(`CREATE TABLE Relations (
    id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	blocklist        TEXT[] NOT NULL DEFAULT '{}',
	pending          JSONB NOT NULL DEFAULT '{"followers":[],"children":[]}'::jsonb,
	following        TEXT[] NOT NULL DEFAULT '{}',
	followers        TEXT[] NOT NULL DEFAULT '{}',
	friends          TEXT[] NOT NULL DEFAULT '{}',
	children         TEXT[] NOT NULL DEFAULT '{}',
	parent           TEXT,

    FOREIGN KEY (id) REFERENCES Logins(id)
)`);

console.log('Creating table Tastes');
await db.run(`CREATE TABLE Tastes (
    id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	likes            TEXT[] NOT NULL DEFAULT '{}',
	hashtags         TEXT[] NOT NULL DEFAULT '{}',

    FOREIGN KEY (id) REFERENCES Logins(id)
)`);

console.log('Creating table Settings');
await db.run(`CREATE TABLE Settings (
    id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	privacy          JSONB NOT NULL DEFAULT '{"profile":"friends","birthday": "friends","status":"friends","dms":"friends"}'::jsonb,
	appearance       JSONB NOT NULL DEFAULT '{"global_theme":"light"}'::jsonb,

    FOREIGN KEY (id) REFERENCES Logins(id)
)`);

/************************************/
// INTERACTIONS

console.log('Creating table Inbox');
await db.run(`CREATE TABLE Inbox (
    id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	requests		 JSONB NOT NULL DEFAULT '{"children":[],"following":[],"followers":[]}'::jsonb,
	other    		 JSONB[] NOT NULL DEFAULT '{}',

    FOREIGN KEY (id) REFERENCES Logins(id)
)`);

console.log('Creating table Posts');
await db.run(`CREATE TABLE Posts (
	id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	author_id        TEXT NOT NULL,
	parent_id        TEXT,

	content          TEXT NOT NULL,
	attachments      TEXT[] NOT NULL DEFAULT '{}',

	visibility       TEXT NOT NULL,
	creation_date	 DATE NOT NULL,
	update_date	     DATE,

	likes            INTEGER NOT NULL,
	tags			 TEXT[] NOT NULL DEFAULT '{}',
	flags			 TEXT[] NOT NULL DEFAULT '{}',

	FOREIGN KEY (author_id) REFERENCES Users(id)
)`);

console.log('Creating table Comments');
await db.run(`CREATE TABLE Comments (
	id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	author_id        TEXT NOT NULL,
	post_id          TEXT NOT NULL,
	parent_id        TEXT,

	content          TEXT NOT NULL,

	visibility       TEXT NOT NULL,
	creation_date	 DATE NOT NULL,
	update_date	     DATE,

	likes            INTEGER NOT NULL,
	flags			 TEXT[] NOT NULL DEFAULT '{}',

	FOREIGN KEY (author_id) REFERENCES Users(id),
	FOREIGN KEY (post_id) REFERENCES Posts(id),
	FOREIGN KEY (parent_id) REFERENCES Comments(id)
)`);

console.log('Creating table Files');
await db.run(`CREATE TABLE Files (
	id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	author_id        TEXT NOT NULL,

	path             TEXT NOT NULL,
	type             TEXT NOT NULL,

	visibility       TEXT NOT NULL,
	ephemeral        BOOLEAN NOT NULL,
	creation_date	 DATE NOT NULL,
	update_date	     DATE,

	FOREIGN KEY (author_id) REFERENCES Users(id)
)`);