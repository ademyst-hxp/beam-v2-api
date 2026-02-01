import type { Badge, PartialProfile, Profile, Relations } from "@/db/models/profiles.js";
import type { PartialPost, Post, PartialComment, Comment } from "@/db/models/interactions.js";

export const convertProfile = (profile: PartialProfile, relations: Relations, badge: Badge | null): Profile => {
    let { flags, ...p } = profile

    return {
        ...p,
        badge: badge,
        followers: relations.followers.length,
        following: relations.following.length
    }
}

export const convertPost = (
    post: PartialPost,
    meta: {
        reposts: number,
        comments: number
    },
    author: Profile
): Post => {
    let { flags, ...p } = post

    return {
        author: author,
        reposts: meta.reposts,
        comments: meta.comments,
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