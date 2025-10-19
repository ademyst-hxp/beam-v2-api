export type Post = {
    id: string,
    author_id: string,
    content: string,
    attachements: string[],
    visibility: number, // 0 = private, 1 = whitelist, 2 = everyone
    likes: string[],
    reposts: string[],
    comments: string[]
}

export type Comment = {
    id: string,
    author_id: string,
    parent_id: string,
    post_id: string,
    content: string,
    visibility: number, // 0 = private, 1 = whitelist, 2 = everyone
    likes: string[]
}