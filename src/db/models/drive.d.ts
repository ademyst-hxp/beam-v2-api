export type File = {
	id: string
	author_id: string

	path: string
	type: string

	visibility: string
	creation_date: Date
	update_date: Date | null
}