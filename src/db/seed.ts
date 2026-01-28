import dotenv from 'dotenv';
dotenv.config({ quiet: true, override: true });

import { db } from './index.js';

console.log('Creating table Logins');
await db.run(`CREATE TABLE IF NOT EXISTS Logins (
    id              TEXT UNIQUE NOT NULL PRIMARY KEY,
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    email           TEXT UNIQUE NOT NULL
)`);

console.log('Creating table Sessions');
await db.run(`CREATE TABLE IF NOT EXISTS Sessions (
    id              TEXT UNIQUE NOT NULL PRIMARY KEY,
    token           TEXT NOT NULL,
    account         TEXT NOT NULL,
    last_activity   TIMESTAMPTZ NOT NULL,
    ip              TEXT NOT NULL,

    FOREIGN KEY (account) REFERENCES Logins(id) ON DELETE CASCADE
)`);

console.log('Creating table Sudo');
await db.run(`CREATE TABLE IF NOT EXISTS Sudo (
    id              TEXT UNIQUE NOT NULL PRIMARY KEY,
	created_at      TIMESTAMPTZ NOT NULL,
    token           TEXT NOT NULL,
	action          TEXT NOT NULL,
    account         TEXT NOT NULL,
    __expires	    TIMESTAMPTZ NOT NULL,
    user_generated  BOOLEAN NOT NULL,

    FOREIGN KEY (account) REFERENCES Logins(id) ON DELETE CASCADE
)`);

console.log('Creating table Entitlements');
await db.run(`CREATE TABLE IF NOT EXISTS Entitlements (
    id              TEXT UNIQUE NOT NULL PRIMARY KEY,
    account         TEXT NOT NULL,
	granted_by	    TEXT NOT NULL,
	granted_at      TIMESTAMPTZ NOT NULL,
	expires_at 	    TIMESTAMPTZ NOT NULL,
	revoked		    BOOLEAN NOT NULL,
    reward_type     TEXT NOT NULL,
	reward_id       TEXT NOT NULL,
	reason		    TEXT,

    FOREIGN KEY (account) REFERENCES Logins(id) ON DELETE CASCADE
)`);

/************************************/
// PROFILS ET RELATIONS

console.log('Creating table Badges');
await db.run(`CREATE TABLE IF NOT EXISTS Badges (
	id              TEXT UNIQUE NOT NULL PRIMARY KEY,
	title           TEXT NOT NULL,
	description     TEXT NOT NULL,
	colors		    JSONB NOT NULL,
	icon		    TEXT NOT NULL,
	level           INTEGER NOT NULL
)`);

console.log('Creating table Users');
await db.run(`CREATE TABLE IF NOT EXISTS Users (
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
	badge           TEXT,
	flags           TEXT[] NOT NULL DEFAULT '{}'::text[],

    FOREIGN KEY (id) REFERENCES Logins(id) ON DELETE CASCADE
)`);

console.log('Creating table Settings');
await db.run(`CREATE TABLE IF NOT EXISTS Settings (
    id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	privacy          JSONB NOT NULL DEFAULT '{"profile":"friends","birthday": "friends","status":"friends","dms":"friends"}'::jsonb,
	appearance       JSONB NOT NULL DEFAULT '{"global_theme":"light"}'::jsonb,
	feed			 JSONB NOT NULL DEFAULT '{"posts_feed":"trending","users_feed":"trending"}'::jsonb,

    FOREIGN KEY (id) REFERENCES Logins(id) ON DELETE CASCADE
)`);

/************************************/
// INTERACTIONS

console.log('Creating table Inbox');
await db.run(`CREATE TABLE IF NOT EXISTS Inbox (
    id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	requests		 JSONB NOT NULL DEFAULT '{"children":[],"following":[],"followers":[]}'::jsonb,
	other    		 JSONB[] NOT NULL DEFAULT '{}'::jsonb[],

    FOREIGN KEY (id) REFERENCES Logins(id) ON DELETE CASCADE
)`);

console.log('Creating table Relations');
await db.run(`CREATE TABLE IF NOT EXISTS Relations (
    id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	blocklist        TEXT[] NOT NULL DEFAULT '{}'::text[],
	following        TEXT[] NOT NULL DEFAULT '{}'::text[],
	followers        TEXT[] NOT NULL DEFAULT '{}'::text[],
	friends          TEXT[] NOT NULL DEFAULT '{}'::text[],
	children         TEXT[] NOT NULL DEFAULT '{}'::text[],
	parent           TEXT,

    FOREIGN KEY (id) REFERENCES Logins(id) ON DELETE CASCADE
)`);

console.log('Creating table Tastes');
await db.run(`CREATE TABLE IF NOT EXISTS Tastes (
    id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	likes            TEXT[] NOT NULL DEFAULT '{}'::text[],
	hashtags         TEXT[] NOT NULL DEFAULT '{}'::text[],

    FOREIGN KEY (id) REFERENCES Logins(id) ON DELETE CASCADE
)`);

console.log('Creating table Posts');
await db.run(`CREATE TABLE IF NOT EXISTS Posts (
	id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	author_id        TEXT NOT NULL,
	parent_id        TEXT,

	content          TEXT NOT NULL,
	attachments      TEXT[] NOT NULL DEFAULT '{}'::text[],

	visibility       TEXT NOT NULL,
	creation_date	 TIMESTAMPTZ NOT NULL,
	update_date	     TIMESTAMPTZ,

	likes            INTEGER NOT NULL,
	tags			 TEXT[] NOT NULL DEFAULT '{}'::text[],
	flags			 TEXT[] NOT NULL DEFAULT '{}'::text[],

	FOREIGN KEY (author_id) REFERENCES Users(id)
)`);

console.log('Creating table Comments');
await db.run(`CREATE TABLE IF NOT EXISTS Comments (
	id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	author_id        TEXT NOT NULL,
	post_id          TEXT NOT NULL,
	parent_id        TEXT,

	content          TEXT NOT NULL,

	visibility       TEXT NOT NULL,
	creation_date	 TIMESTAMPTZ NOT NULL,
	update_date	     TIMESTAMPTZ,

	likes            INTEGER NOT NULL,
	flags			 TEXT[] NOT NULL DEFAULT '{}'::text[],

	FOREIGN KEY (author_id) REFERENCES Users(id),
	FOREIGN KEY (post_id) REFERENCES Posts(id),
	FOREIGN KEY (parent_id) REFERENCES Comments(id)
)`);

console.log('Creating table Files');
await db.run(`CREATE TABLE IF NOT EXISTS Files (
	id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	author_id        TEXT NOT NULL,

	path             TEXT NOT NULL,
	type             TEXT NOT NULL,

	visibility       TEXT NOT NULL,
	ephemeral        BOOLEAN NOT NULL,
	creation_date	 TIMESTAMPTZ NOT NULL,
	update_date	     TIMESTAMPTZ,

	FOREIGN KEY (author_id) REFERENCES Users(id)
)`);

/************************************/
// MODERATION

console.log('Creating table Reports');
await db.run(`CREATE TABLE IF NOT EXISTS Reports (
	id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	reporter_id      TEXT NOT NULL,
	target_type      TEXT NOT NULL,
	target_id        TEXT NOT NULL,
	categories		 TEXT[] NOT NULL DEFAULT '{}'::text[],
	reason           TEXT NOT NULL,
	reported_at		 TIMESTAMPTZ NOT NULL,
	status           TEXT NOT NULL,
	resolved_at      TIMESTAMPTZ,
	resolved_by      TEXT,

	FOREIGN KEY (reporter_id) REFERENCES Users(id),
	FOREIGN KEY (resolved_by) REFERENCES Users(id)
)`);

console.log('Creating table Sanctions');
await db.run(`CREATE TABLE IF NOT EXISTS Sanctions (
	id               TEXT UNIQUE NOT NULL PRIMARY KEY,
	target_id        TEXT NOT NULL,
	issued_by        TEXT NOT NULL,
	reason           TEXT NOT NULL,
	sanction_type    TEXT NOT NULL,
	issued_at        TIMESTAMPTZ NOT NULL,
	expires_at       TIMESTAMPTZ,
	active           BOOLEAN NOT NULL,

	FOREIGN KEY (target_id) REFERENCES Users(id),
	FOREIGN KEY (issued_by) REFERENCES Users(id)
)`);

console.log('Database schema created successfully.');

console.log('Seeding initial data...');
const badges: Record<string, any>[] = [
	{
		id: "fonda",
		title: "Fondateurs",
		description: "Ce badge sert à reconnaître les fondateurs du réseau social Beam.",
		colors: {
			stops: ["#ff7925", "#ff2d81"],
			primary: "#ff5c5f",
		},
		icon: "@/fonda",
		level: 9,
	},
	{
		id: "team",
		title: "Équipe",
		description:
			"Ce badge sert à reconnaître les personnes faisant officiellement partie de l'équipe de Beam. Elle inclut administrateurs, développeurs et testeurs.",
		colors: {
			stops: ["#1daae7", "#25c5ff"],
			primary: "#1daae7",
		},
		icon: "@/team",
		level: 8,
	},
	{
		id: "supermod",
		title: "Modération",
		description: "Ce badge sert à reconnaître les modérateurs au sein de la plateforme.",
		colors: {
			stops: ["#17c57c", "#1adf8e"],
			primary: "#17c57c",
		},
		icon: "@/moderator",
		level: 7,
	},
	{
		id: "mod",
		title: "Modération",
		description: "Ce badge sert à reconnaître les modérateurs au sein de la plateforme.",
		colors: {
			stops: ["#17c57c", "#1adf8e"],
			primary: "#17c57c",
		},
		icon: "@/moderator",
		level: 6,
	},
	{
		id: "verified",
		title: "Vérifié(e)",
		description:
			"Badge permettant de limiter les usurpations d'identité et les fausses informations.",
		colors: {
			stops: ["#3186f8", "#1e7bf7"],
			primary: "#3186f8",
		},
		icon: "@/verified",
		level: 5,
	},
	{
		id: "prestige",
		title: "Prestige",
		description:
			"Le badge Prestige sert à distinguer les utilisateurs importants de Beam, même s'ils ne font pas partie de l'équipe. Seuls les fondateurs ont le droit de décerner ce titre.",
		colors: {
			stops: ["#edb140", "#d49236"],
			primary: "#edb140",
		},
		icon: "@/prestige",
		level: 4,
	},
	{
		id: "premium",
		title: "Premium",
		description: "Ce badge est réservé aux utilisateurs ayant l'abonnement Beam+.",
		colors: {
			stops: ["#d013ff", "#a911cf"],
			primary: "#d013ff",
		},
		icon: "",
		level: 4,
	},
]

for (const badge of badges) {
	console.log(`Inserting badge ${badge.id}`);
	await db.run(`INSERT INTO Badges (id, title, description, colors, icon, level) VALUES ($1, $2, $3, $4, $5, $6)`, [
		badge.id,
		badge.title,
		badge.description,
		JSON.stringify(badge.colors),
		badge.icon,
		badge.level,
	]);
}