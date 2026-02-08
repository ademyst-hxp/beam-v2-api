import type { Badge, PartialProfile, Profile, Relations } from "@/db/models/profiles.js";
import type { PartialPost, Post, PartialComment, Comment } from "@/db/models/interactions.js";
import { File } from "@/db/models/drive.js";

import db from "@/db/index.js";

export const convertProfile = (profile: PartialProfile, relations: Relations, badge: Badge | null): Profile => {
    let { flags, ...p } = profile

    return {
        ...p,
        badge: badge,
        followers: relations.followers.length,
        following: relations.following.length
    }
}

export const convertPost = async (
    post: PartialPost,
    meta: {
        reposts: number,
        comments: number
    },
    author: Profile
): Promise<Post> => {
    let { flags, attachments, ...p } = post


    const _attachments = await db.all('SELECT * FROM Files WHERE id = ANY($1);', [ attachments ]) || [] as File[]

    return {
        author: author,
        reposts: meta.reposts,
        comments: meta.comments,
        attachments: _attachments,
        ...p
    }
}

export const convertComment = (
    comment: PartialComment, 
    meta: { answers: number },
    post: Post,
    author: Profile,
): Comment => {
    let { flags, ...c } = comment

    return {
        ...c,
        answers: meta.answers,
        author: author,
        post: post
    }
}