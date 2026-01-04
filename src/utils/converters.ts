import type { PartialProfile, Profile, Relations } from "@/db/models/profiles.js";
import type { PartialPost, Post, PartialComment, Comment } from "@/db/models/interactions.js";

export const convertProfile = (profile: PartialProfile, relations: Relations): Profile => {
    let { flags, ...p } = profile

    return {
        ...p,
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

/* convertComment */
/*const data: any = {
    ...__without_id,
    answers: parseInt(answers.count),
    author: convertProfile(_profile, relations),
    post: convertPost(
        _post, 
        {
            reposts: parseInt(reposts.count),
            comments: parseInt(comments.count)
        },
        _profile,
        relations
    )
}*/