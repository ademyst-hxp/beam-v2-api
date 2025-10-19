import crypto from 'crypto';
import { Profile, ProfileSettings } from '../models/profiles.js';
import type { Session } from '../models/auth.js';

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

export const can_access = (value: string, profile: Profile, settings: ProfileSettings, author: Session | null): boolean => {
	console.log(value, profile, settings, author)
    if (!author) return value == 'everyone';
    if (settings.blocklist.includes(author.account) || settings.blocklist.includes(author.ip || '')) return false;

    switch (value) {
        case 'me': return author.account === profile.id;
        case 'friends': return author.account === profile.id || settings.friends.includes(author.account);
        case 'followers': return author.account === profile.id || profile.followers.includes(author.account);
        case 'everyone': return true;
        default: return false;
    }
}