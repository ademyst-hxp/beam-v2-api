import { parse } from "path";
import { db } from "../db/index.js";
import type { Badge, Profile } from "../db/models/profiles.js";

export async function checkLevels() {
    console.log("Checking levels...");

    const rows: any[] = await db.all('SELECT id FROM Users;') as any[];
    console.log(rows.length + " users found.");

    for (const row of rows) {
        let user: Profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ row.id ]) as Profile;

        let entitlements: any[] = await db.all('SELECT * FROM Entitlements WHERE account = $1', [ user.id ]) as any[];

        entitlements = entitlements.filter((e: any) => {
            if (e.expires_at && new Date(e.expires_at) < new Date()) return false
            if (e.revoked) return false
            if (e.reward_type !== 'level') return false

            return true
        });

        entitlements.sort((a: any, b: any) => {
            return parseInt(b.reward_id) - parseInt(a.reward_id)
        });

        if (entitlements.length === 0) {
            user.level = 3;
            await db.run('UPDATE Users SET level = $1 WHERE id = $2;', [ 3, user.id ]);
            continue;
        } else if (user.level >= 3) {
            let topLevel = parseInt(entitlements[0].reward_id);

            if (user.level !== topLevel) {
                user.level = topLevel;
                await db.run('UPDATE Users SET level = $1 WHERE id = $2;', [ topLevel, user.id ]);
            }
        }
    }
}