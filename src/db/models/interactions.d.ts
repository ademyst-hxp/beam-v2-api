import type { File } from "./drive.js";
import type { Profile } from "./profiles.js";

export type Post = {
	id: string
	author_id: Profile.id
	parent_id: Post.id | null

	content: string
	attachments: File.id[]

	visibility: "me" | "friends" | "followers" | "everyone"
	creation_date: Date
	update_date: Date | null

	likes: number
	tags: string[]
	flags: string[]
}

export type Comment = {
	id: string
	author_id: Profile.id
	post_id: Post.id
	parent_id: Comment.id | null

	content: string

	visibility: "me" | "friends" | "followers" | "everyone"
	creation_date: Date
	update_date: Date | null

	likes: number
	tags: string[]
	flags: string[]
}