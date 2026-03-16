import crypto from 'crypto';

import { PartialProfile, Relations } from '../db/models/profiles.js';
import type { Session } from '../db/models/auth.js';

export const genChar = (size: number, base: BufferEncoding): string => {
	return crypto.randomBytes(size).toString(base);
}

export const can_access = (value: string, profile: PartialProfile, relations: Relations, author: Session | null): boolean => {
    if (!author) return value == 'everyone';
    if (relations.blocklist.includes(author.account) || relations.blocklist.includes(author.ip || '')) return false;

    switch (value) {
        case 'me': return author.account === profile.id;
        case 'friends': return author.account === profile.id || relations.friends.includes(author.account);
        case 'followers': return author.account === profile.id || relations.followers.includes(author.account);
        case 'everyone': return true;
        default: return false;
    }
}

export const calcAge = (date: Date): number => {
	const diff = Date.now() - date.getTime();
	const age = new Date(diff);

	return Math.abs(age.getUTCFullYear() - 1970);
}