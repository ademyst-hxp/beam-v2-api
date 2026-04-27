import { Router } from "express";

import type { Request, Response } from "express";

import { convertPost, convertProfile } from "../utils/converters.js";

import { db } from "../db/index.js";
import type { Session } from "../db/models/auth.js";
import type {
	Badge,
	PartialProfile,
	Profile,
	Relations,
	Tastes,
} from "../db/models/profiles.js";
import { PartialPost, Post } from "../db/models/interactions.js";

const router = Router();

router.get("/users", async (req: Request, res: Response) => {
	try {
		let users: Profile[] = [];
		let stats: Record<string, { likes: number }> = {};

		let _result: PartialProfile[] = (await db.all(
			"SELECT * FROM Users;",
		)) as PartialProfile[];

		for (const u of _result) {
			const relations: Relations | undefined = (await db.get(
				"SELECT * FROM Relations WHERE id = $1;",
				[u.id],
			)) as Relations;

			const badge: Badge | null = u.badge
				? ((await db.get("SELECT * FROM Badges WHERE id = $1;", [
						u.badge,
					])) as Badge)
				: null;

			let _stats =
				((await db.all(
					"SELECT likes FROM Posts WHERE author_id = $1;",
					[u.id],
				)) as { likes: number }[]) || [];

			stats[u.id] = {
				likes: _stats.reduce((acc, curr) => acc + curr.likes, 0),
			};

			let new_u: Profile = convertProfile(u, relations, badge);

			users.push(new_u);
		}

		users = users
			.sort((a, b) => b.followers - a.followers)
			.slice(
				parseInt(req.query.offset as string) || 0,
				parseInt(req.query.limit as string) || users.length,
			);

		users = users.filter((u) => u.level >= 3);

		res.status(200).json(users);
		return;
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

router.get("/posts", async (req: Request, res: Response) => {
	let token =
		req.cookies?.token || req.headers?.authorization?.split(" ")[1] || null;
	let order_by = req.query.sort_by || "stats";
	let category = req.query.category || "all";
	let after = new Date((req.query.after as string) || 0);
	let before = new Date((req.query.before as string) || new Date());

	try {
		let session: Session | null =
			((await db.get("SELECT * FROM Sessions WHERE token = $1;", [
				token,
			])) as Session) || null;

		let my_relations: Relations | undefined;
		let my_tastes: Tastes | undefined;

		if (session) {
			my_relations = (await db.get(
				"SELECT * FROM Relations WHERE id = $1;",
				[session.account],
			)) as Relations;

			my_tastes = (await db.get("SELECT * FROM Tastes WHERE id = $1;", [
				session.account,
			])) as Tastes;
		} else {
			my_relations = {
				id: "",
				blocklist: [],
				pending: { children: [], followers: [], following: [] },
				following: [],
				followers: [],
				friends: [],
				parent: null,
				children: [],
			} as Relations;

			my_tastes = { id: "", likes: [], hashtags: [] } as Tastes;
		}

		let posts: Post[] = [];
		let _result: PartialPost[] = (await db.all(
			"SELECT * FROM Posts WHERE creation_date >= $1 AND creation_date <= $2 ORDER BY creation_date DESC;",
			[after, before],
		)) as PartialPost[];

		for (const p of _result) {
			const profile: PartialProfile | undefined = (await db.get(
				"SELECT * FROM Users WHERE id = $1;",
				[p.author_id],
			)) as PartialProfile;

			const relations: Relations | undefined = (await db.get(
				"SELECT * FROM Relations WHERE id = $1;",
				[p.author_id],
			)) as Relations;

			const badge: Badge | null = profile.badge
				? ((await db.get("SELECT * FROM Badges WHERE id = $1;", [
						profile.badge,
					])) as Badge)
				: null;

			const reposts = await db.get(
				`SELECT COUNT(*) FROM Posts WHERE parent_id = $1;`,
				[p.id],
			);

			const comments = await db.get(
				`SELECT COUNT(*) FROM Comments WHERE post_id = $1;`,
				[p.id],
			);

			let new_p: Post = await convertPost(
				p,
				{ reposts: reposts.count, comments: comments.count },
				convertProfile(profile, relations, badge),
			);


			if (
				p.flags.some((f) =>
					["NFE", "AI", "spam", "harrassment", "suspicious"].includes(
						f,
					),
				) ||
				p.visibility != "everyone" ||
				new_p.author.level < 3 ||
				new_p.author.level > 7
			) {
				continue;
			}

			posts.push(new_p);
		}

		if (order_by == "date") {
			posts = posts.sort(
				(a, b) =>
					new Date(b.creation_date).getTime() -
					new Date(a.creation_date).getTime(),
			);
		} else if (order_by == "stats") {
			const calcStats = (post: any) => {
				let stats = post.likes;
				stats += 1.5 * post.reposts;
				stats += 2 * post.comments;

				return stats;
			};

			posts = posts.sort((a, b) => calcStats(b) - calcStats(a));
		}

		if (category != "all") {
			posts = posts.filter((p) => p.tags.includes(category as string));
		}

		res.status(200).json(posts);
		return;
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Error" });
	}
});

export default router;
