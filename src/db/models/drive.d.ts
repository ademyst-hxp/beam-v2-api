export type File = {
	id: string
	author_id: string

	path: string
	type: string

	visibility: string
	ephemeral: boolean
	creation_date: Date
	update_date: Date | null
}