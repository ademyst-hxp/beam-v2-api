export type Profile = {
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
	flags: string[]
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
	}
}

export type Relations = {
	id: Profile.id

	blocklist: (Profile.id | string)[] // IDs et IPs

	following: Profile.id[]
	followers: Profile.id[]
	friends: Profile.id[]

	parents: Profile.id[]
	children: Profile.id[]
}

export type Notification = {
	id: string
	authors: Profile.id[]
	type: "like" | "repost" | "warn" | "follower" | "alert" | "official"
	target: string
	read: boolean
}

export type Inbox = {
	id: Profile.id

	requests: {
		children: Profile.id[]
		following: Profile.id[]
		followers: Profile.id[]
	}

	other: Notification[]
}

export type Tastes = {
	id: Profile.id
	likes: string[]
	hashtags: string[]
}