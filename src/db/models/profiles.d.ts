export type Badge = {
	id: string
	title: string
	description: string
	colors: Record<string, string | string[]>
	icon: string
	level: number
}

export type PartialProfile = {
	id: string
	name: string
	display_name: string | null
	pronouns: string | null
	birthday: Date | null
	account_type: string | null
	description: string | null
	status: string | null

	creation_date: Date
	update_date: Date

	badge: string | null
	level: number
	flags: string[]
}

export type Profile = {
	id: string
	name: string
	display_name: string | null
	pronouns: string | null
	birthday: Date | null
	account_type: string | null
	description: string | null
	status: string | null

	creation_date: Date
	update_date: Date

	badge: Badge | null
	level: number

	following: number
	followers: number
}

export type Settings = {
	id: Profile.id
	privacy: {
		profile: "me" | "friends" | "followers" | "everyone"
		birthday: "me" | "friends" | "followers" | "everyone"
		status: "me" | "friends" | "followers" | "everyone"
		dms: "me" | "friends" | "followers" | "everyone"
	}
	appearance: {
		global_theme: string
	},
	feed: {
		posts_feed: "trending" | "following" | "top" | "latest"
		users_feed: "trending" | "top"
	}
}

export type Relations = {
	id: Profile.id

	blocklist: (Profile.id | string)[] // IDs et IPs

	following: Profile.id[]
	followers: Profile.id[]
	friends: Profile.id[]

	parent: Profile.id | null
	children: Profile.id[]
}

export type Tastes = {
	id: Profile.id
	likes: string[]
	hashtags: string[]
}