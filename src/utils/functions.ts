import crypto from 'crypto';

import { PartialProfile, Settings, Relations } from '../db/models/profiles.js';
import type { Session } from '../db/models/auth.js';

export const genChar = (size: number, base: BufferEncoding): string => {
	return crypto.randomBytes(size).toString(base);
}

export const convert = (obj: Record<string, any>) => {
	let keys = Object.keys(obj);
	let data: Record<string, any> = {};

	for (const k of keys) {
		let v = obj[k];

		if (v instanceof Array || v instanceof Object || typeof v === 'boolean') data[k] = JSON.stringify(v)
		else data[k] = v;
	}

	return data
}

export const parse = (obj: Record<string, any> | undefined) => {
	if (!obj) return undefined;

	let keys = Object.keys(obj);
	let data: Record<string, any> = {};

	for (const k of keys) {
		let v = obj[k];

		try {
			data[k] = JSON.parse(v);
		} catch {
			data[k] = v;
		}
	}

	return data
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