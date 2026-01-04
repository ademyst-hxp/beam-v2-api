import type { File } from "./drive.js";
import type { Profile } from "./profiles.js";

export type PartialPost = {
	id: string
	author_id: Profile.id
	parent_id: PartialPost.id | null

	content: string
	attachments: File.id[]

	visibility: "me" | "friends" | "followers" | "everyone"
	creation_date: Date
	update_date: Date | null

	likes: number
	tags: string[]
	flags: string[]
}

export type Post = {
	id: string
	author: Profile
	parent_id: Post.id | null

	content: string
	attachments: File.id[]

	visibility: "me" | "friends" | "followers" | "everyone"
	creation_date: Date
	update_date: Date | null

	likes: number
	reposts: number
	comments: number

	tags: string[]
}

export type Comment = {
	id: string
	author: Profile
	post: Post
	parent_id: Comment.id | null

	content: string

	visibility: "me" | "friends" | "followers" | "everyone"
	creation_date: Date
	update_date: Date | null

	likes: number
	answers: number

	tags: string[]
}

export type PartialComment = {
	id: string
	author_id: Profile.id
	post_id: PartialPost.id
	parent_id: PartialComment.id | null

	content: string

	visibility: "me" | "friends" | "followers" | "everyone"
	creation_date: Date
	update_date: Date | null

	likes: number
	tags: string[]
	flags: string[]
}