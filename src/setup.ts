import dotenv from 'dotenv';
dotenv.config({ quiet: true, override: true });

import { db } from './utils/db.js';

console.log('Creating table Logins');
await db.run(`CREATE TABLE Logins (
    id TEXT UNIQUE NOT NULL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
)`);

console.log('Creating table Sessions');
await db.run(`CREATE TABLE Sessions (
    id TEXT UNIQUE NOT NULL PRIMARY KEY,
    token TEXT NOT NULL,
    account TEXT NOT NULL,
    last_activity TEXT,
    ip TEXT NOT NULL,
    FOREIGN KEY (id) REFERENCES Logins(id)
)`);

console.log('Creating table Users');
await db.run(`CREATE TABLE Users (
    id TEXT UNIQUE NOT NULL PRIMARY KEY,
	name TEXT UNIQUE NOT NULL,
	display_name TEXT,
	creation_date TEXT NOT NULL,
	update_date TEXT NOT NULL,
	followers TEXT NOT NULL,
	following TEXT NOT NULL,
	status TEXT,
	birthday TEXT,
	pronouns TEXT,
	account_type TEXT,
	level INTEGER NOT NULL,
    FOREIGN KEY (id) REFERENCES Logins(id)
)`);

console.log('Creating table Settings');
await db.run(`CREATE TABLE Settings (
    id TEXT UNIQUE NOT NULL PRIMARY KEY,
	blocklist TEXT NOT NULL,
	pending TEXT NOT NULL,
	friends TEXT NOT NULL,
	children TEXT NOT NULL,
	parent TEXT,
	preferences TEXT NOT NULL,
    FOREIGN KEY (id) REFERENCES Logins(id)
)`);

/************************************/

console.log('Creating table Inbox');
await db.run(`CREATE TABLE Inbox (
    id TEXT UNIQUE NOT NULL PRIMARY KEY,
	messages TEXT NOT NULL,
	friends TEXT NOT NULL,
	children TEXT NOT NULL,
	parent TEXT NOT NULL,
	private TEXT NOT NULL,
	notifications TEXT NOT NULL,
	settings TEXT NOT NULL,
    FOREIGN KEY (id) REFERENCES Logins(id)
)`);

console.log('Creating table Posts');
await db.run(`CREATE TABLE Posts (
	id TEXT UNIQUE NOT NULL PRIMARY KEY,
	author_id TEXT NOT NULL,
	content TEXT NOT NULL,
	attachments TEXT NOT NULL,
	visibility INTEGER NOT NULL,
	likes TEXT NOT NULL,
	reposts TEXT NOT NULL,
	comments TEXT NOT NULL,
	FOREIGN KEY (author_id) REFERENCES Users(id)
)`);

console.log('Creating table Comments');
await db.run(`CREATE TABLE Comments (
	id TEXT UNIQUE NOT NULL PRIMARY KEY,
	author_id TEXT NOT NULL,
	post_id TEXT NOT NULL,
	parent_id TEXT,
	content TEXT NOT NULL,
	visibility INTEGER NOT NULL,
	likes TEXT NOT NULL,
	FOREIGN KEY (author_id) REFERENCES Users(id),
	FOREIGN KEY (post_id) REFERENCES Posts(id),
	FOREIGN KEY (parent_id) REFERENCES Comments(id)
)`);