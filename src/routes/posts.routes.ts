import { Router } from "express";
import type { Request, Response } from "express";

import { calcAge, can_access, genChar } from "../utils/functions.js";
import {
	convertComment,
	convertPost,
	convertProfile,
} from "../utils/converters.js";

import { db } from "../db/index.js";
import type { Session } from "../db/models/auth.js";
import type {
	Comment,
	PartialComment,
	PartialPost,
	Post,
} from "../db/models/interactions.js";
import type {
	PartialProfile,
	Settings,
	Relations,
	Tastes,
	Badge,
} from "../db/models/profiles.js";
import type {
	PartialInbox,
	PartialNotificationPost,
} from "../db/models/inbox.js";

const router = Router();

router.get("/fetch", async (req: Request, res: Response) => {
	let token =
		req.cookies?.token || req.headers?.authorization?.split(" ")[1] || null;

	let query: string | null = (req.query.q as string) || null;
	let author: string = req.query.author as string;
	let before: string = new Date(
		(req.query.before as string) || new Date().toISOString(),
	).toISOString();
	let after: string = new Date(
		(req.query.after as string) || new Date(0).toISOString(),
	).toISOString();

	try {
		let session: Session | undefined = (await db.get(
			"SELECT * FROM Sessions WHERE token = $1;",
			[token],
		)) as Session;
		let me: PartialProfile | null = null;

		if (session) {
			me = (await db.get("SELECT * FROM Users WHERE id = $1;", [
				session.account,
			])) as PartialProfile;

			if (!me) {
				me = null;
			}
		} else {
			me = null;
		}

		let posts: Post[] = [];
		let _result: PartialPost[] = [];

		if (query) {
			_result = (await db.all(
				"SELECT * FROM Posts WHERE content ILIKE $1 AND creation_date < $2 AND creation_date > $3 ORDER BY creation_date DESC;",
				[`%${query}%`, before, after],
			)) as PartialPost[];
			console.log(`Fetched ${_result.length} posts from the database`);
		} else {
			_result = (await db.all(
				"SELECT * FROM Posts WHERE creation_date < $1 AND creation_date > $2 ORDER BY creation_date DESC;",
				[before, after],
			)) as PartialPost[];
			console.log(`Fetched ${_result.length} posts from the database`);
		}

		let author_profile: PartialProfile | null;

		if (author) {
			author_profile = (await db.get(
				"SELECT * FROM Users WHERE name = $1;",
				[author],
			)) as PartialProfile;

			if (!author_profile) {
				res.status(404).json({ message: "AuthorNotFound" });
				return;
			}

			_result = _result.filter((p) => p.author_id === author_profile!.id);
		} else {
			author_profile = null;
		}

		for (const p of _result) {
			let relations: Relations | undefined;
			relations = (await db.get(
				"SELECT * FROM Relations WHERE id = $1;",
				[p.author_id],
			)) as Relations;

			const profile: PartialProfile | undefined = (await db.get(
				"SELECT * FROM Users WHERE id = $1;",
				[p.author_id],
			)) as PartialProfile;

			if (
				profile &&
				can_access(p.visibility, profile, relations, session) &&
				(!p.flags.includes("NFE") ||
					calcAge(me?.birthday || new Date()) >= 18 ||
					profile.id === me?.id)
			) {
				posts.push(
					await convertPost(
						p,
						{
							reposts: (
								await db.get(
									`SELECT COUNT(*) FROM Posts WHERE parent_id = $1;`,
									[p.id],
								)
							).count,
							comments: (
								await db.get(
									`SELECT COUNT(*) FROM Comments WHERE post_id = $1;`,
									[p.id],
								)
							).count,
						},
						convertProfile(
							profile,
							relations,
							profile.badge
								? ((await db.get(
										"SELECT * FROM Badges WHERE id = $1;",
										[profile.badge],
									)) as Badge)
								: null,
						),
					),
				);
			}
		}

		res.status(200).json(posts);
		return;
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.get("/:id", async (req: Request, res: Response) => {
	const id = req.params.id;

	let token =
		req.cookies?.token || req.headers?.authorization?.split(" ")[1] || null;

	try {
		let session: Session | null = (await db.get(
			"SELECT * FROM Sessions WHERE token = $1;",
			[token],
		)) || null;

		let author: PartialProfile | null;
		author = (await db.get("SELECT * FROM Users WHERE id = $1;", [
			session?.account,
		])) || null;

		let post: PartialPost | null;
		post = (await db.get("SELECT * FROM Posts WHERE id = $1;", [
			id,
		])) as PartialPost;

		if (!post) {
			res.status(404).json({ message: "PostNotFound" });
			return;
		}

		let profile: PartialProfile | undefined;

		if (
			post.tags.includes("NFE") &&
			calcAge(author?.birthday || new Date()) < 18
		) {
			post.content = "";
			post.attachments = [];
			profile = (await db.get("SELECT * FROM Users WHERE name = $1;", [
				"ghost",
			])) as PartialProfile;
		} else {
			profile = (await db.get("SELECT * FROM Users WHERE id = $1;", [
				post.author_id,
			])) as PartialProfile;
		}

		if (!profile) {
			res.status(403).json({ message: "PrivateAccount" });
			return;
		}

		let relations: Relations | undefined;
		relations = (await db.get("SELECT * FROM Relations WHERE id = $1;", [
			profile.id,
		])) as Relations;

		let settings: Settings | undefined;
		settings = (await db.get("SELECT * FROM Settings WHERE id = $1;", [
			profile.id,
		])) as Settings;

		const badge: Badge | null = profile.badge
			? ((await db.get("SELECT * FROM Badges WHERE id = $1;", [
					profile.badge,
				])) as Badge)
			: null;

		const is_visible = (field: string) =>
			can_access(field, profile, relations, session);

		if (!is_visible(settings.privacy.birthday)) {
			profile.birthday = null;
		}

		if (!is_visible(settings.privacy.status)) {
			profile.status = null;
		}

		if (!is_visible(settings.privacy.profile)) {
			profile.pronouns = null;
		}

		if (!is_visible(post.visibility)) {
			res.status(403).json({ message: "PrivatePost" });
			return;
		}

		const reposts = await db.get(
			`SELECT COUNT(*) FROM Posts WHERE parent_id = $1;`,
			[id],
		);
		const comments = await db.get(
			`SELECT COUNT(*) FROM Comments WHERE post_id = $1;`,
			[id],
		);

		const data: Post = await convertPost(
			post,
			{
				reposts: parseInt(reposts.count),
				comments: parseInt(comments.count),
			},
			convertProfile(profile, relations, badge),
		);

		res.status(200).json(data);
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.delete("/:id", async (req: Request, res: Response) => {
	const id = req.params.id;

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

		let author: PartialProfile | null;
		author = (await db.get("SELECT * FROM Users WHERE id = $1;", [
			session.account,
		])) as PartialProfile;

		if (!author) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		let post: PartialPost;
		post = (await db.get("SELECT * FROM Posts WHERE id = $1;", [
			id,
		])) as PartialPost;

		if (!post) {
			res.status(404).json({ message: "PostNotFound" });
			return;
		}

		if (author.level >= 6 || (author && post.author_id == author.id)) {
			await db.run("DELETE FROM Posts WHERE id = $1;", [id]);
			await db.run("DELETE FROM Files WHERE id = ANY($1);", [
				post.attachments,
			]);
			await db.run("DELETE FROM Comments WHERE post_id = $1;", [id]);
			await db.run(
				"UPDATE Posts SET reposts = reposts - 1 WHERE id = $1;",
				[post.parent_id],
			);
			await db.run(
				"UPDATE Tastes SET likes = array_remove(likes, $1) WHERE $1 = ANY(likes);",
				[id],
			);
		} else {
			res.status(403).json({ message: "Forbidden" });
			return;
		}

		res.status(200).json({ message: "Success" });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.post("/:id/like", async (req: Request, res: Response) => {
	const id = req.params.id;

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

		let author: PartialProfile | null;
		author = (await db.get("SELECT * FROM Users WHERE id = $1;", [
			session.account,
		])) as PartialProfile;

		if (!author) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		let tastes: Tastes | null;
		tastes = (await db.get("SELECT * FROM Tastes WHERE id = $1;", [
			session.account,
		])) as Tastes;

		let post: any;
		post = await db.get("SELECT * FROM Posts WHERE id = $1;", [id]);

		if (!post) {
			res.status(404).json({ message: "PostNotFound" });
			return;
		}

		let profile: PartialProfile | undefined;
		profile = (await db.get("SELECT * FROM Users WHERE id = $1;", [
			post.author_id,
		])) as PartialProfile;

		if (!profile) {
			res.status(403).json({ message: "PrivateAccount" });
			return;
		}

		let relations: Relations | undefined;
		relations = (await db.get("SELECT * FROM Relations WHERE id = $1;", [
			profile.id,
		])) as Relations;

		if (
			relations.blocklist.includes(session.id) ||
			relations.blocklist.includes(session.ip || "")
		) {
			res.status(404).json({ message: "PostNotFound" });
			return;
		}

		const is_visible = (field: string) =>
			can_access(field, profile, relations, session);

		if (!is_visible(post.visibility)) {
			res.status(403).json({ message: "PrivateAccount" });
			return;
		}

		if (tastes.likes.includes(post.id)) {
			res.status(204).json({ message: "Success" });
			return;
		} else {
			tastes.likes.push(post.id);
			post.likes += 1;

			let inbox: PartialInbox | undefined;
			inbox = (await db.get("SELECT * FROM Inbox WHERE id = $1;", [
				profile.id,
			])) as PartialInbox;

			const new_notif: PartialNotificationPost = {
				id: genChar(12, "hex").toUpperCase(),
				date: new Date(),
				type: "like",
				isGroupable: false,
				read: false,
				author: author.id,
				target: post.id,
			};

			inbox.other.unshift(new_notif);

			await db.run("UPDATE Inbox SET other = $1 WHERE id = $2;", [
				inbox.other,
				profile.id,
			]);
		}

		await db.run("UPDATE Tastes SET likes = $1 WHERE id = $2;", [
			tastes.likes,
			author.id,
		]);
		await db.run("UPDATE Posts SET likes = $1 WHERE id = $2;", [
			post.likes,
			post.id,
		]);

		res.status(200).json({ message: "Success" });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.delete("/:id/like", async (req: Request, res: Response) => {
	const id = req.params.id;

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

		let author: PartialProfile | null;
		author = (await db.get("SELECT * FROM Users WHERE id = $1;", [
			session.account,
		])) as PartialProfile;

		if (!author) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		let tastes: Tastes | null;
		tastes = (await db.get("SELECT * FROM Tastes WHERE id = $1;", [
			session.account,
		])) as Tastes;

		let post: any;
		post = await db.get("SELECT * FROM Posts WHERE id = $1;", [id]);

		if (!post) {
			res.status(404).json({ message: "PostNotFound" });
			return;
		}

		let profile: PartialProfile | undefined;
		profile = (await db.get("SELECT * FROM Users WHERE id = $1;", [
			post.author_id,
		])) as PartialProfile;

		if (!profile) {
			res.status(403).json({ message: "PrivateAccount" });
			return;
		}

		let relations: Relations | undefined;
		relations = (await db.get("SELECT * FROM Relations WHERE id = $1;", [
			profile.id,
		])) as Relations;

		if (
			relations.blocklist.includes(session.id) ||
			relations.blocklist.includes(session.ip || "")
		) {
			res.status(404).json({ message: "PostNotFound" });
			return;
		}

		const is_visible = (field: string) =>
			can_access(field, profile, relations, session);

		if (!is_visible(post.visibility)) {
			res.status(403).json({ message: "PrivatePost" });
			return;
		}

		if (!tastes.likes.includes(post.id)) {
			res.status(204).json({ message: "Success" });
			return;
		} else {
			tastes.likes = tastes.likes.filter(
				(_id: string) => _id !== post.id,
			);
			post.likes -= 1;
		}

		await db.run("UPDATE Tastes SET likes = $1 WHERE id = $2;", [
			tastes.likes,
			author.id,
		]);
		await db.run("UPDATE Posts SET likes = $1 WHERE id = $2;", [
			post.likes,
			post.id,
		]);

		res.status(200).json({ message: "Success" });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.post("/:id/report", async (req: Request, res: Response) => {
	const id = req.params.id;

	const reason: string = req.body.reason || "";
	const categories: string[] = req.body.categories.split(",") || [];
	const details: string = req.body.details || "";

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

		let author: PartialProfile | null;
		author = (await db.get("SELECT * FROM Users WHERE id = $1;", [
			session.account,
		])) as PartialProfile;

		if (!author) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		let post: any;
		post = await db.get("SELECT * FROM Posts WHERE id = $1;", [id]);

		if (!post) {
			res.status(404).json({ message: "PostNotFound" });
			return;
		}

		if (reason.length > 1000 || details.length > 5000) {
			res.status(413).json({ message: "ReportTooLong" });
			return;
		}

		if (categories.length > 5) {
			res.status(413).json({ message: "TooManyCategories" });
			return;
		}

		if (categories.length == 0) {
			res.status(400).json({ message: "NoCategories" });
			return;
		}

		let report: Record<string, any> = {
			id: genChar(12, "hex").toUpperCase(),
			reporter_id: author.id,
			target_type: "post",
			target_id: post.id,
			categories: categories,
			reason: reason,
			reported_at: new Date(),
			status: "open",
			details: details,
			resolved_at: null,
			resolved_by: null,
		};

		await db.run(
			"INSERT INTO Reports (id, reporter_id, target_type, target_id, categories, reason, reported_at, status, details, resolved_at, resolved_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
			Object.values(report),
		);

		if (categories.includes("security.self.age")) {
			await db.run("UPDATE Users SET level = $1 WHERE id = $2;", [
				2,
				post.author_id,
			]);
		}

		let inbox: PartialInbox | undefined;
		inbox = (await db.get("SELECT * FROM Inbox WHERE id = $1;", [
			author.id,
		])) as PartialInbox;

		const new_notif: PartialNotificationPost = {
			id: report.id,
			date: new Date(),
			type: "post_report_confirmation",
			isGroupable: false,
			read: false,
			author: "0",
			target: post.id,
		};

		inbox.other.unshift(new_notif);

		await db.run("UPDATE Inbox SET other = $1 WHERE id = $2;", [
			inbox.other,
			author.id,
		]);

		res.status(200).json({ message: "Success" });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.put("/:id/edit_flags", async (req: Request, res: Response) => {
	const id = req.params.id;

	let flags: string[] | Record<string, boolean> = req.body.flags || [];

	if (typeof flags === "object" && !Array.isArray(flags)) {
		const _flags: string[] = [];

		for (const [key, value] of Object.entries(flags)) {
			if (value) _flags.push(key);
		}

		flags = _flags;
	}

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

		let author: PartialProfile | null;
		author = (await db.get("SELECT * FROM Users WHERE id = $1;", [
			session.account,
		])) as PartialProfile;

		if (!author) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		if (author.level < 6) {
			res.status(403).json({ message: "Forbidden" });
			return;
		}

		let post: any;
		post = await db.get("SELECT * FROM Posts WHERE id = $1;", [id]);

		if (!post) {
			res.status(404).json({ message: "PostNotFound" });
			return;
		}

		// const added_flags = flags.filter((f: string) => !post.flags.includes(f));
		// const removed_flags = post.flags.filter((f: string) => !flags.includes(f));

		post.flags = Array.from(new Set([...(post.flags || []), ...flags]));

		await db.run("UPDATE Posts SET flags = $1 WHERE id = $2;", [
			post.flags,
			post.id,
		]);

		res.status(200).json({ message: "Success" });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.get("/:id/comments", async (req: Request, res: Response) => {
	const id = req.params.id;

	let token =
		req.cookies?.token || req.headers?.authorization?.split(" ")[1] || null;

	try {
		let session: Session | undefined = (await db.get(
			"SELECT * FROM Sessions WHERE token = $1;",
			[token],
		)) as Session;

		let author: PartialProfile | null;
		author = (await db.get("SELECT * FROM Users WHERE id = $1;", [
			session.account,
		])) as PartialProfile;

		let post: PartialPost | null;
		post = (await db.get("SELECT * FROM Posts WHERE id = $1;", [
			id,
		])) as PartialPost;

		if (!post) {
			res.status(404).json({ message: "PostNotFound" });
			return;
		}

		const profile: PartialProfile | undefined = (await db.get(
			"SELECT * FROM Users WHERE id = $1;",
			[post.author_id],
		)) as PartialProfile;
		const relations: Relations | undefined = (await db.get(
			"SELECT * FROM Relations WHERE id = $1;",
			[post.author_id],
		)) as Relations;
		const badge: Badge | null = profile.badge
			? ((await db.get("SELECT * FROM Badges WHERE id = $1;", [
					profile.badge,
				])) as Badge)
			: null;

		let comments: Comment[] = [];
		let _result: PartialComment[] = (await db.all(
			"SELECT * FROM Comments WHERE post_id = $1 ORDER BY creation_date DESC;",
			[id],
		)) as PartialComment[];

		for (const c of _result) {
			let __profile: PartialProfile | undefined;

			if (
				c.flags.includes("NFE") &&
				calcAge(author?.birthday || new Date()) < 18
			) {
				c.content = "";
				__profile = (await db.get(
					"SELECT * FROM Users WHERE name = $1;",
					["ghost"],
				)) as PartialProfile;
			} else {
				__profile = (await db.get(
					"SELECT * FROM Users WHERE id = $1;",
					[post.author_id],
				)) as PartialProfile;
			}

			const __relations: Relations | undefined = (await db.get(
				"SELECT * FROM Relations WHERE id = $1;",
				[__profile.id],
			)) as Relations;
			const __badge: Badge | null = __profile.badge
				? ((await db.get("SELECT * FROM Badges WHERE id = $1;", [
						__profile.badge,
					])) as Badge)
				: null;

			const is_visible = (field: string) =>
				can_access(field, profile, relations, session);

			if (
				is_visible(c.visibility) &&
				!relations.blocklist.includes(session?.account)
			) {
				let new_c: Comment = convertComment(
					c,
					{
						answers: (
							await db.get(
								`SELECT COUNT(*) FROM Comments WHERE parent_id = $1;`,
								[c.id],
							)
						).count,
					},
					await convertPost(
						post,
						{
							reposts: (
								await db.get(
									`SELECT COUNT(*) FROM Posts WHERE parent_id = $1;`,
									[post.id],
								)
							).count,
							comments: (
								await db.get(
									`SELECT COUNT(*) FROM Comments WHERE post_id = $1;`,
									[post.id],
								)
							).count,
						},
						convertProfile(profile, relations, badge),
					),
					convertProfile(__profile, __relations, __badge),
				);

				comments.push(new_c);
			}
		}

		res.status(200).json(comments);
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

/**********************************/

router.post("/new", async (req: Request, res: Response) => {
	let token =
		req.cookies?.token || req.headers?.authorization?.split(" ")[1] || null;

	const content: string = req.body.content;
	const visibility: PartialPost["visibility"] = req.body.visibility;
	const answers_to: string | null = req.body.answers_to || null;

	const is_nudity: boolean = req.query.is_nudity === "true" || false;
	const is_ai: boolean = req.query.is_ai === "true" || false;

	try {
		let session: Session | undefined = (await db.get(
			"SELECT * FROM Sessions WHERE token = $1;",
			[token],
		)) as Session;

		if (!session) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		let author: PartialProfile | null;
		author = (await db.get("SELECT * FROM Users WHERE id = $1;", [
			session.account,
		])) as PartialProfile;

		if (!author) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		let relations: Relations | null;
		relations = (await db.get("SELECT * FROM Relations WHERE id = $1;", [
			session.account,
		])) as Relations;

		const badge: Badge | null = author.badge
			? ((await db.get("SELECT * FROM Badges WHERE id = $1;", [
					author.badge,
				])) as Badge)
			: null;

		const parent: PartialPost | undefined = answers_to
			? ((await db.get("SELECT * FROM Posts WHERE id = $1;", [
					answers_to,
				])) as PartialPost)
			: undefined;
		const parent_author: PartialProfile | undefined = parent
			? ((await db.get("SELECT * FROM Users WHERE id = $1;", [
					parent.author_id,
				])) as PartialProfile)
			: undefined;

		if (answers_to && !(parent && parent_author)) {
			res.status(404).json({ message: "ParentPostNotFound" });
			return;
		}

		/* Limitations & sécurité */
		if (
			content.length >
			(author.level >= 5 ? 2000 : author.level >= 4 ? 1000 : 500)
		) {
			res.status(413).json({ message: "PostTooLong" });
			return;
		}

		/* Enregistrement du post */
		const tags = [...content.matchAll(/#([\p{L}\p{N}_]+)/gu)].map(
			(match) => match[1],
		);

		let post: PartialPost = {
			id: genChar(8, "hex").toUpperCase(),
			author_id: author.id,
			parent_id: parent?.id || null,
			content: content,
			attachments: [],
			visibility: visibility,
			creation_date: new Date(),
			update_date: null,
			likes: 0,
			tags: tags,
			flags: [...(is_nudity ? ["NFE"] : []), ...(is_ai ? ["AI"] : [])],
		};

		if (answers_to) {
			const parent_relations: Relations | undefined = (await db.get(
				"SELECT * FROM Relations WHERE id = $1;",
				[parent_author!.id],
			)) as Relations;
			const is_visible = (field: string) =>
				can_access(field, parent_author!, parent_relations, session);

			if (!is_visible(parent!.visibility)) {
				res.status(403).json({ message: "ParentPostIsPrivate" });
				return;
			}

			const parent_inbox: PartialInbox | undefined = (await db.get(
				"SELECT * FROM Inbox WHERE id = $1;",
				[parent_author!.id],
			)) as PartialInbox;

			const new_notif: PartialNotificationPost = {
				id: genChar(12, "hex").toUpperCase(),
				date: new Date(),
				type: "repost",
				isGroupable: false,
				read: false,
				author: author.id,
				target: post!.id,
			};

			parent_inbox.other.unshift(new_notif);

			await db.run("UPDATE Inbox SET other = $1 WHERE id = $2;", [
				parent_inbox.other,
				parent_author!.id,
			]);
		}

		const mentions = [...content.matchAll(/@([a-z0-9._]+)/gu)].map(
			(match) => match[1],
		);

		for (const mention of mentions) {
			const mentioned_profile: PartialProfile | undefined = (await db.get(
				"SELECT * FROM Users WHERE name = $1;",
				[mention],
			)) as PartialProfile;

			if (mentioned_profile) {
				const mentioned_relations: Relations | undefined =
					(await db.get("SELECT * FROM Relations WHERE id = $1;", [
						mentioned_profile.id,
					])) as Relations;
				const mentioned_settings: Settings | undefined = (await db.get(
					"SELECT * FROM Settings WHERE id = $1;",
					[mentioned_profile.id],
				)) as Settings;

				const is_visible = (field: string) =>
					can_access(
						field,
						mentioned_profile!,
						mentioned_relations,
						session,
					);

				if (is_visible(mentioned_settings.privacy.profile)) {
					const mentioned_inbox: PartialInbox | undefined =
						(await db.get("SELECT * FROM Inbox WHERE id = $1;", [
							mentioned_profile.id,
						])) as PartialInbox;

					const new_notif: PartialNotificationPost = {
						id: genChar(12, "hex").toUpperCase(),
						date: new Date(),
						type: "mention",
						isGroupable: false,
						read: false,
						author: author.id,
						target: post!.id,
					};

					mentioned_inbox.other.unshift(new_notif);

					await db.run("UPDATE Inbox SET other = $1 WHERE id = $2;", [
						mentioned_inbox.other,
						mentioned_profile.id,
					]);
				}
			}
		}

		await db.run(
			"INSERT INTO Posts (id, author_id, parent_id, content, attachments, visibility, creation_date, update_date, likes, tags, flags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
			Object.values(post),
		);

		const data: Post = await convertPost(
			post,
			{ reposts: 0, comments: 0 },
			convertProfile(author, relations, badge),
		);

		res.status(200).json(data);
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.put("/:id/edit", async (req: Request, res: Response) => {
	let token =
		req.cookies?.token || req.headers?.authorization?.split(" ")[1] || null;

	const id = req.params.id;

	const content: string = req.body.content;
	const visibility: PartialPost["visibility"] = req.body.visibility;

	const is_nudity: boolean = req.query.is_nudity === "true" || false;
	const is_ai: boolean = req.query.is_ai === "true" || false;

	try {
		let session: Session | undefined = (await db.get(
			"SELECT * FROM Sessions WHERE token = $1;",
			[token],
		)) as Session;

		if (!session) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		let author: PartialProfile | null;
		author = (await db.get("SELECT * FROM Users WHERE id = $1;", [
			session.account,
		])) as PartialProfile;

		if (!author) {
			res.status(401).json({ message: "Unauthorized" });
			return;
		}

		let relations: Relations | null;
		relations = (await db.get("SELECT * FROM Relations WHERE id = $1;", [
			session.account,
		])) as Relations;

		let badge: Badge | null = null;

		if (author.badge) {
			badge = (await db.get("SELECT * FROM Badges WHERE id = $1;", [
				author.badge,
			])) as Badge;
		}

		/* Limitations & sécurité */
		if (
			content.length >
			(author.level >= 5 ? 2000 : author.level >= 4 ? 1000 : 500)
		) {
			res.status(413).json({ message: "PostTooLong" });
			return;
		}

		/* Enregistrement du post */
		const tags = [...content.matchAll(/#([\p{L}\p{N}_]+)/gu)].map(
			(match) => match[1],
		);

		let post: PartialPost;
		post = (await db.get("SELECT * FROM Posts WHERE id = $1;", [
			id,
		])) as PartialPost;

		if (!post) {
			res.status(404).json({ message: "PostNotFound" });
			return;
		}

		if (post.author_id !== author.id) {
			res.status(403).json({ message: "Forbidden" });
			return;
		}

		post.content = content;
		post.visibility = visibility;
		post.update_date = new Date();
		post.tags = tags;

		// On empêche les utilisateurs de retirer les flags eux-mêmes
		if (is_nudity && !post.flags.includes("NFE")) post.flags.push("NFE");
		if (is_ai && !post.flags.includes("AI")) post.flags.push("AI");

		const mentions = [...content.matchAll(/@([a-z0-9._]+)/gu)].map(
			(match) => match[1],
		);

		for (const mention of mentions) {
			const mentioned_profile: PartialProfile | undefined = (await db.get(
				"SELECT * FROM Users WHERE name = $1;",
				[mention],
			)) as PartialProfile;

			if (mentioned_profile) {
				const mentioned_relations: Relations | undefined =
					(await db.get("SELECT * FROM Relations WHERE id = $1;", [
						mentioned_profile.id,
					])) as Relations;
				const mentioned_settings: Settings | undefined = (await db.get(
					"SELECT * FROM Settings WHERE id = $1;",
					[mentioned_profile.id],
				)) as Settings;

				const is_visible = (field: string) =>
					can_access(
						field,
						mentioned_profile!,
						mentioned_relations,
						session,
					);

				if (is_visible(mentioned_settings.privacy.profile)) {
					const mentioned_inbox: PartialInbox | undefined =
						(await db.get("SELECT * FROM Inbox WHERE id = $1;", [
							mentioned_profile.id,
						])) as PartialInbox;

					const new_notif: PartialNotificationPost = {
						id: genChar(12, "hex").toUpperCase(),
						date: new Date(),
						type: "mention",
						isGroupable: false,
						read: false,
						author: author.id,
						target: post!.id,
					};

					mentioned_inbox.other.unshift(new_notif);

					await db.run("UPDATE Inbox SET other = $1 WHERE id = $2;", [
						mentioned_inbox.other,
						mentioned_profile.id,
					]);
				}
			}
		}

		await db.run(
			"UPDATE Posts SET content = $1, visibility = $2, update_date = $3, tags = $4, flags = $5 WHERE id = $6;",
			[
				post.content,
				post.visibility,
				post.update_date,
				post.tags,
				post.flags,
				post.id,
			],
		);

		const data: Post = await convertPost(
			post,
			{ reposts: 0, comments: 0 },
			convertProfile(author, relations, badge),
		);

		res.status(200).json(data);
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

export default router;
