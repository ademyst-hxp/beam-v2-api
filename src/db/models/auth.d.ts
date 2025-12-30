export type Account = {
	id: string
	username: string
	password_hash: string
	email: string
}

export type Session = {
	id: string
	token: string
	account: string
	last_activity: Date
	ip: string | undefined
}