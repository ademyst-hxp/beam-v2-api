import type { Profile, Relations } from "@/db/models/profiles.js";
import type { Post } from "@/db/models/interactions.js";

export const convertProfile = (profile: Profile, relations: Relations): {
    id: string
	name: string
	display_name: string | null
	pronouns: string | null
	birthday: string | null
	account_type: string | null
	description: string | null
	status: string | null

	creation_date: string
	update_date: string

	level: number

    followers: number
    following: number
} => {
    let { flags, ...p } = profile

    return {
        ...p,
        followers: relations.followers.length,
        following: relations.following.length
    }
}

export const convertPost = (post: Post, meta: { reposts: number, comments: number }, author: Profile, relations: Relations): {
    id: string
    parent_id: string | null

    content: string
    attachments: string[]

    visibility: "me" | "friends" | "followers" | "everyone"
    creation_date: Date
    update_date: Date | null

    likes: number
    reposts: number
    comments: number

    tags: string[]

    author: {
        id: string
        name: string
        display_name: string | null
        pronouns: string | null
        birthday: string | null
        account_type: string | null
        description: string | null
        status: string | null

        creation_date: string
        update_date: string

        level: number

        followers: number
        following: number
    }
} => {
    let { flags, ...p } = post

    return {
        author: convertProfile(author, relations),
        reposts: meta.reposts,
        comments: meta.comments,
        ...p
    }
}