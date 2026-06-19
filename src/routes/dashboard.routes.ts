import { Router } from "express";
import type { Request, Response } from "express";

import multer from "multer";
import { readFile } from "fs/promises";
import sharp from "sharp";

import { can_access } from "../utils/functions.js";
import { convertPost, convertProfile } from "../utils/converters.js";

import { db, supabase } from "../db/index.js";
import type { Session } from "../db/models/auth.js";
import type {
	Badge,
	PartialProfile,
	Settings,
	Relations,
	Tastes,
} from "../db/models/profiles.js";
import type { PartialPost, Post } from "../db/models/interactions.js";
import type { PartialInbox, Inbox } from "../db/models/inbox.js";
import type { Notification, PendingRequest } from "../db/models/inbox.js";

const router = Router();

function isValidImage(buffer: Buffer): boolean {
	if (buffer.length < 12) return false;

	// JPEG: FF D8 FF
	if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
		return true;
	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if (
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47 &&
		buffer[4] === 0x0d &&
		buffer[5] === 0x0a &&
		buffer[6] === 0x1a &&
		buffer[7] === 0x0a
	)
		return true;
	// GIF: GIF87a or GIF89a
	if (
		buffer[0] === 0x47 &&
		buffer[1] === 0x49 &&
		buffer[2] === 0x46 &&
		buffer[3] === 0x38 &&
		(buffer[4] === 0x37 || buffer[4] === 0x39) &&
		buffer[5] === 0x61
	)
		return true;
	// WebP: RIFF????WEBP
	if (
		buffer[0] === 0x52 &&
		buffer[1] === 0x49 &&
		buffer[2] === 0x46 &&
		buffer[3] === 0x46 &&
		buffer[8] === 0x57 &&
		buffer[9] === 0x45 &&
		buffer[10] === 0x42 &&
		buffer[11] === 0x50
	)
		return true;
	// BMP: BM
	if (buffer[0] === 0x42 && buffer[1] === 0x4d) return true;
	// TIFF: little-endian (II) or big-endian (MM)
	if (
		(buffer[0] === 0x49 &&
			buffer[1] === 0x49 &&
			buffer[2] === 0x2a &&
			buffer[3] === 0x00) ||
		(buffer[0] === 0x4d &&
			buffer[1] === 0x4d &&
			buffer[2] === 0x00 &&
			buffer[3] === 0x2a)
	)
		return true;

	return false;
}

router.get("/", async (req: Request, res: Response) => {
	let token =
		req.cookies?.token || req.headers?.authorization?.split(" ")[1] || null;

	try {
		let session: Session | undefined = (await db.get(
			"SELECT * FROM Sessions WHERE token = $1;",
			[token],
		)) as Session;

		if (!session) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		let profile: PartialProfile | undefined;
		profile = (await db.get("SELECT * FROM Users WHERE id = $1;", [
			session.account,
		])) as PartialProfile;

		let relations: Relations | undefined;
		relations = (await db.get("SELECT * FROM Relations WHERE id = $1;", [
			session.account,
		])) as Relations;

		let settings: Settings | undefined;
		settings = (await db.get("SELECT * FROM Settings WHERE id = $1;", [
			session.account,
		])) as Settings;

		let tastes: Tastes | undefined;
		tastes = (await db.get("SELECT * FROM Tastes WHERE id = $1;", [
			session.account,
		])) as Tastes;

		let inbox: PartialInbox | undefined;
		inbox = (await db.get("SELECT * FROM Inbox WHERE id = $1;", [
			session.account,
		])) as PartialInbox;

		let badge: Badge | null = profile.badge
			? ((await db.get("SELECT * FROM Badges WHERE id = $1;", [
					profile.badge,
				])) as Badge)
			: null;

		let new_profile = convertProfile(profile, relations, badge);

		res.status(200).json({
			profile: new_profile,
			avatar: "/users/" + new_profile.name + "/avatar",
			relations: {
				...relations,
				incoming: inbox.incoming.follow.map((request) => request.from),
				outgoing: inbox.outgoing.follow.map((request) => request.to),
			},
			settings: settings,
			tastes: tastes,
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.get("/inbox", async (req: Request, res: Response) => {
	let token =
		req.cookies?.token || req.headers?.authorization?.split(" ")[1] || null;
	let leave_unread = req.query.leave_unread === "true" || false;
	const leave_unread = req.query.leave_unread === "true";

	try {
		const session = (await db.get(
			"SELECT * FROM Sessions WHERE token = $1;",
			[token],
		)) as Session;

		if (!session) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		const profile = (await db.get("SELECT * FROM Users WHERE id = $1;", [
			session.account,

		if (!profile) {
			res.status(404).json({ message: "UserNotFound" });
			return;
		}
		)) as Relations | undefined;

		const inbox = (await db.get("SELECT * FROM Inbox WHERE id = $1;", [
			session.account,
		])) as PartialInbox | undefined;

		if (!inbox) {
		}

		const badge = profile.badge
			? ((await db.get("SELECT * FROM Badges WHERE id = $1;", [
					profile.badge,
				])) as Badge)
			: null;

		let relations: Relations | undefined;
		/*
		 * Collecte de tous les IDs nécessaires
		 */
		const userIds = new Set<number>();

		for (const u of inbox.outgoing.children) userIds.add(u.to);
		for (const u of inbox.outgoing.follow) userIds.add(u.to);

		for (const u of inbox.incoming.children) userIds.add(u.from);
		for (const u of inbox.incoming.follow) userIds.add(u.from);

		for (const n of inbox.other) {
			if (n.author) {
				userIds.add(n.author);
			}
		}

		const ids = [...userIds];

		/*
		 * Chargement en batch
		 */
		let users: PartialProfile[] = [];
		let allRelations: Relations[] = [];
		let badges: Badge[] = [];

		if (ids.length > 0) {
			const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");

			users = (await db.all(
				`SELECT * FROM Users WHERE id IN (${placeholders});`,
				ids,
			)) as PartialProfile[];

			allRelations = (await db.all(
				`SELECT * FROM Relations WHERE id IN (${placeholders});`,
				ids,
			)) as Relations[];

			const badgeIds = [
				...new Set(users.map((u) => u.badge).filter(Boolean)),
			];

			if (badgeIds.length > 0) {
				const badgePlaceholders = badgeIds
					.map((_, i) => `$${i + 1}`)
					.join(",");

				badges = (await db.all(
					`SELECT * FROM Badges WHERE id IN (${badgePlaceholders});`,
					badgeIds,
				)) as Badge[];
			}
		}

		/*
		 * Maps O(1)
		 */
		const usersMap = new Map(users.map((u) => [u.id, u]));

		const relationsMap = new Map(allRelations.map((r) => [r.id, r]));

		const badgesMap = new Map(badges.map((b) => [b.id, b]));

		const selfProfile = convertProfile(profile, relations!, badge);

		const new_inbox: Inbox = {
			id: inbox.id,
			read: [],
			unread: [],
			outgoing: {
				children: [],
				follow: [],
			},
			incoming: {
				children: [],
				follow: [],
			},
		};

		/*
		 * Outgoing children
		 */
		for (const reqItem of inbox.outgoing.children) {
			const user = usersMap.get(reqItem.to);

			if (!user) continue;

			new_inbox.outgoing.children.push({
				from: selfProfile,
				to: convertProfile(
					user,
					relationsMap.get(user.id)!,
					user.badge ? badgesMap.get(user.badge) || null : null,
				),
				date: new Date(reqItem.date),
			} as PendingRequest);
		}

		/*
		 * Outgoing follow
		 */
		for (const reqItem of inbox.outgoing.follow) {
			const user = usersMap.get(reqItem.to);

			if (!user) continue;

			new_inbox.outgoing.follow.push({
				from: selfProfile,
				to: convertProfile(
					user,
					relationsMap.get(user.id)!,
					user.badge ? badgesMap.get(user.badge) || null : null,
				),
				date: new Date(reqItem.date),
			} as PendingRequest);
		}

		/*
		 * Incoming children
		 */
		for (const reqItem of inbox.incoming.children) {
			const user = usersMap.get(reqItem.from);

			if (!user) continue;

			new_inbox.incoming.children.push({
				from: convertProfile(
					user,
					relationsMap.get(user.id)!,
					user.badge ? badgesMap.get(user.badge) || null : null,
				),
				to: selfProfile,
				date: new Date(reqItem.date),
			} as PendingRequest);
		}

		/*
		 * Incoming follow
		 */
		for (const reqItem of inbox.incoming.follow) {
			const user = usersMap.get(reqItem.from);

			if (!user) continue;

			new_inbox.incoming.follow.push({
				from: convertProfile(
					user,
					relationsMap.get(user.id)!,
					user.badge ? badgesMap.get(user.badge) || null : null,
				),
				to: selfProfile,
				date: new Date(reqItem.date),
			} as PendingRequest);
		}

		/*
		 * Notifications
		 */
		for (const notification of inbox.other) {
			const newNotification: Notification = {
				...notification,
			} as Notification;

			if (notification.author) {
				const author = usersMap.get(notification.author);

				if (!author) continue;

				newNotification.author = convertProfile(
					author,
					relationsMap.get(author.id)!,
					author.badge ? badgesMap.get(author.badge) || null : null,
				);
			}

			if (notification.read) {
				new_inbox.read.push(newNotification);
			} else {
				new_inbox.unread.push(newNotification);
			}
		}

		res.status(200).json(new_inbox);

		/*
		 * Marquer comme lu en arrière-plan
		 */
		if (!leave_unread) {
			void (async () => {
				try {
					for (const n of inbox.other) {
						n.read = true;
					}

					await db.run("UPDATE Inbox SET other = $1 WHERE id = $2;", [
						inbox.other,
						inbox.id,
					]);
				} catch (err) {
					console.error(err);
				}
			})();
		}
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.get("/settings", async (req: Request, res: Response) => {
	let token =
		req.cookies?.token || req.headers?.authorization?.split(" ")[1] || null;

	try {
		let session: Session | undefined = (await db.get(
			"SELECT * FROM Sessions WHERE token = $1;",
			[token],
		)) as Session;

		if (!session) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		let settings: Settings | undefined;
		settings = (await db.get("SELECT * FROM Settings WHERE id = $1;", [
			session.account,
		])) as Settings;

		res.status(200).json(settings);
		return;
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.put("/settings", async (req: Request, res: Response) => {
	const token =
		req.cookies?.token || req.headers.authorization?.split(" ")[1];

	if (!token) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	const updates: Settings = req.body;

	try {
		const session = await db.get<Session>(
			"SELECT * FROM Sessions WHERE token = $1",
			[token],
		);

		if (!session) {
			return res.status(401).json({ message: "Invalid session" });
		}

		const currentSettings = await db.get<Settings>(
			"SELECT * FROM Settings WHERE id = $1",
			[session.account],
		);

		const new_settings = {
			...currentSettings,
			...updates,
		};

		await db.run(
			"UPDATE Settings SET privacy = $1, appearance = $2 WHERE id = $3;",
			[new_settings.privacy, new_settings.appearance, session.account],
		);

		res.status(200).json({ message: "Success" });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.get("/entitlements", async (req: Request, res: Response) => {
	let token =
		req.cookies?.token || req.headers?.authorization?.split(" ")[1] || null;

	let include_expired = req.query.include_expired === "true" || false;
	let include_revoked = req.query.include_revoked === "true" || false;
	let type = req.query.type as string | null;
	let target = req.query.target as string | null;

	try {
		let session: Session | undefined = (await db.get(
			"SELECT * FROM Sessions WHERE token = $1;",
			[token],
		)) as Session;

		if (!session) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		let entitlements;
		entitlements = await db.all(
			"SELECT * FROM Entitlements WHERE account = $1;",
			[session.account],
		);

		entitlements = entitlements.filter((e: any) => {
			if (
				!include_expired &&
				e.expires_at &&
				new Date(e.expires_at) < new Date()
			)
				return false;
			if (!include_revoked && e.revoked) return false;
			if (type && e.reward_type !== type) return false;
			if (target && e.reward_id !== target) return false;

			return true;
		});

		res.status(200).json(entitlements);
		return;
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.get("/entitlements/badges", async (req: Request, res: Response) => {
	let token =
		req.cookies?.token || req.headers?.authorization?.split(" ")[1] || null;

	try {
		let session: Session | undefined = (await db.get(
			"SELECT * FROM Sessions WHERE token = $1;",
			[token],
		)) as Session;

		if (!session) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		let entitlements;
		entitlements = await db.all(
			"SELECT * FROM Entitlements WHERE account = $1;",
			[session.account],
		);

		entitlements = entitlements.filter((e: any) => {
			if (e.expires_at && new Date(e.expires_at) < new Date())
				return false;
			if (e.revoked) return false;
			if (e.reward_type !== "badge") return false;

			return true;
		});

		const badges: Badge[] = [];

		for (const e of entitlements) {
			const badge: Badge | null = (await db.get(
				"SELECT * FROM Badges WHERE id = $1;",
				[e.reward_id],
			)) as Badge;

			if (badge) {
				badges.push(badge);
			} else {
				console.log("Badge not found:", e.reward_id);
			}
		}

		res.status(200).json(badges);
		return;
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.put("/profile", async (req: Request, res: Response) => {
	let token =
		req.cookies?.token || req.headers?.authorization?.split(" ")[1] || null;
	const updates: Partial<PartialProfile> = req.body;

	try {
		let session: Session | undefined = (await db.get(
			"SELECT * FROM Sessions WHERE token = $1;",
			[token],
		)) as Session;

		let profile: PartialProfile | undefined;
		profile = (await db.get("SELECT * FROM Users WHERE id = $1;", [
			session.account,
		])) as PartialProfile;

		const new_profile = {
			...profile,
			...updates,
		};

		if (
			new_profile.name.length < 3 ||
			new_profile.name.length > 24 ||
			!/^[a-z0-9_]+$/.test(new_profile.name)
		) {
			res.status(400).json({ message: "InvalidProfileName" });
			return;
		}

		if (new_profile.display_name && new_profile.display_name.length > 30) {
			res.status(400).json({ message: "InvalidDisplayName" });
			return;
		}

		if (new_profile.status && new_profile.status.length > 25) {
			res.status(400).json({ message: "InvalidStatus" });
			return;
		}

		if (new_profile.description && new_profile.description.length > 200) {
			res.status(400).json({ message: "InvalidDescription" });
			return;
		}

		if (new_profile.pronouns && new_profile.pronouns.length > 20) {
			res.status(400).json({ message: "InvalidPronouns" });
			return;
		}

		let entitlements;
		entitlements = await db.all(
			"SELECT * FROM Entitlements WHERE account = $1;",
			[session.account],
		);

		entitlements = entitlements.filter((e: any) => {
			if (e.expires_at && new Date(e.expires_at) < new Date())
				return false;
			if (e.revoked) return false;
			if (e.reward_type !== "badge") return false;
			if (e.reward_id !== new_profile.badge) return false;

			return true;
		});

		if (new_profile.badge && !entitlements.length) {
			new_profile.badge = null;
		}

		await db.run(
			"UPDATE Users SET name = $1, display_name = $2, pronouns = $3, account_type = $4, description = $5, status = $6, update_date = $7, badge = $8 WHERE id = $9;",
			[
				new_profile.name,
				new_profile.display_name,
				new_profile.pronouns,
				new_profile.account_type,
				new_profile.description,
				new_profile.status,
				new Date(),
				new_profile.badge,
				session.account,
			],
		);

		await db.run("UPDATE Logins SET username = $1 WHERE id = $2;", [
			new_profile.name,
			session.account,
		]);

		res.status(200).json({ message: "Success" });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

const avatar_upload = multer({
	dest: ".local/uploads/", // dossier temporaire
	limits: { fileSize: 5 * 1024 * 1024 }, // limite de taille de fichier à 5MB
});

router.post(
	"/avatar",
	avatar_upload.single("avatar"),
	async (req: Request, res: Response) => {
		let token =
			req.cookies?.token ||
			req.headers?.authorization?.split(" ")[1] ||
			null;
		const avatar_data = req.file;

		try {
			let session: Session | undefined = (await db.get(
				"SELECT * FROM Sessions WHERE token = $1;",
				[token],
			)) as Session;

			if (!session) {
				res.status(401).json({ message: "Unauthorized" });
				return;
			}

			const file_buffer = await readFile(avatar_data!.path);

			if (!isValidImage(file_buffer)) {
				res.status(400).json({ message: "InvalidImageFile" });
				return;
			}

			const webp_buffer = await sharp(file_buffer).webp().toBuffer();

			await db.run(
				"INSERT INTO Files (id, author_id, path, type, visibility, ephemeral, creation_date, update_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT(id) DO UPDATE SET type = $4, update_date = $8;",
				[
					session.account,
					session.account,
					`/avatars/${session.account}`,
					"image/webp",
					"everyone",
					false,
					new Date(),
					new Date(),
				],
			);

			await supabase.storage
				.from("profiles")
				.upload(`/avatars/${session.account}`, webp_buffer, {
					contentType: "image/webp",
					upsert: true,
				});

			res.status(200).json({ message: "Success" });
		} catch (err) {
			console.error(err);
			res.status(500).json({ message: "Error" });
		}
	},
);

router.get("/feed", async (req: Request, res: Response) => {
	let token =
		req.cookies?.token || req.headers?.authorization?.split(" ")[1] || null;
	const offset = parseInt(req.query.offset as string) || 0;
	const limit = parseInt(req.query.limit as string) || 50;

	try {
		let session: Session | undefined = (await db.get(
			"SELECT * FROM Sessions WHERE token = $1;",
			[token],
		)) as Session;

		if (!session) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		let my_relations: Relations | undefined;
		my_relations = (await db.get("SELECT * FROM Relations WHERE id = $1;", [
			session.account,
		])) as Relations;

		let my_tastes: Tastes | undefined;
		my_tastes = (await db.get("SELECT * FROM Tastes WHERE id = $1;", [
			session.account,
		])) as Tastes;

		let likes: string[] = [];

		if (my_relations.following.length > 0) {
			const influencer_tastes = (await db.all(
				"SELECT * FROM Tastes WHERE id = ANY($1);",
				[my_relations.following],
			)) as Tastes[];
			likes = influencer_tastes.flatMap((t) => t.likes || []);
		}

		let posts: Post[] = [];
		let _result: PartialPost[] = (await db.all(
			"SELECT * FROM Posts WHERE id = ANY($1) OR author_id = ANY($2) OR likes > 5 ORDER BY creation_date DESC;",
			[likes, my_relations.following],
		)) as PartialPost[];

		const post_ids = _result.map((p) => p.id);
		const author_ids = Array.from(new Set(_result.map((p) => p.author_id)));

		const profiles =
			author_ids.length > 0
				? ((await db.all("SELECT * FROM Users WHERE id = ANY($1);", [
						author_ids,
					])) as PartialProfile[])
				: [];

		const relations =
			author_ids.length > 0
				? ((await db.all(
						"SELECT * FROM Relations WHERE id = ANY($1);",
						[author_ids],
					)) as Relations[])
				: [];

		const badge_ids = Array.from(
			new Set(profiles.map((profile) => profile.badge).filter(Boolean)),
		) as string[];

		const badges =
			badge_ids.length > 0
				? ((await db.all("SELECT * FROM Badges WHERE id = ANY($1);", [
						badge_ids,
					])) as Badge[])
				: [];

		const repost_counts =
			post_ids.length > 0
				? ((await db.all(
						"SELECT parent_id AS id, COUNT(*)::int AS count FROM Posts WHERE parent_id = ANY($1) GROUP BY parent_id;",
						[post_ids],
					)) as Array<{ id: string; count: number | string }>)
				: [];

		const comment_counts =
			post_ids.length > 0
				? ((await db.all(
						"SELECT post_id AS id, COUNT(*)::int AS count FROM Comments WHERE post_id = ANY($1) GROUP BY post_id;",
						[post_ids],
					)) as Array<{ id: string; count: number | string }>)
				: [];

		const profiles_by_id = new Map(
			profiles.map((profile) => [profile.id, profile]),
		);

		const relations_by_id = new Map(relations.map((rel) => [rel.id, rel]));
		const badges_by_id = new Map(badges.map((badge) => [badge.id, badge]));
		const reposts_by_post_id = new Map(
			repost_counts.map((count_row) => [
				count_row.id,
				Number(count_row.count),
			]),
		);

		const comments_by_post_id = new Map(
			comment_counts.map((count_row) => [
				count_row.id,
				Number(count_row.count),
			]),
		);

		for (const p of _result) {
			const profile: PartialProfile | undefined = profiles_by_id.get(
				p.author_id,
			);

			if (!profile) continue;

			const relation: Relations | undefined = relations_by_id.get(
				p.author_id,
			);

			if (!relation) continue;
			const badge: Badge | null = profile.badge
				? (badges_by_id.get(profile.badge) ?? null)
				: null;

			const is_visible = (field: string) =>
				can_access(field, profile, relation, session);

			let new_p = await convertPost(
				p,
				{
					reposts: reposts_by_post_id.get(p.id) ?? 0,
					comments: comments_by_post_id.get(p.id) ?? 0,
				},
				convertProfile(profile, relation, badge),
			);

			if (
				is_visible(p.visibility) &&
				!my_relations.blocklist.includes(new_p.author.id)
			) {
				posts.push(new_p);
			}
		}

		posts = posts.sort(
			(a, b) =>
				new Date(b.creation_date).getTime() -
				new Date(a.creation_date).getTime(),
		);

		const calcStats = (post: Post): number => {
			let stats = post.likes;
			stats += 1.5 * post.reposts;
			stats += 2 * post.comments;
			stats += 5 * (post.author.level - 3); // mise en avant des comptes de confiance
			stats +=
				40 *
				(7 -
					(new Date().getTime() - post.creation_date.getTime()) /
						1000 /
						60 /
						60 /
						24); // mise en avant du contenu récent

			return stats;
		};

		posts = posts.sort((a, b) => calcStats(b) - calcStats(a));
		posts = posts.filter((p) => p.author.id != session!.account);

		if (posts.length > limit) {
			posts = posts.filter(
				(p) =>
					p.creation_date >=
					new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
			);
		}

		posts = posts.slice(offset, offset + limit);

		res.status(200).json({ posts: posts });
		return;
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

export default router;
