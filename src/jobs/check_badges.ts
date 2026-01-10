import { db } from "../db/index.js";
import type { Badge, Profile } from "../db/models/profiles.js";

export async function checkBadges() {
    console.log("Checking badges...");

    const rows: any[] = await db.all('SELECT id FROM Users;') as any[];
    console.log(rows.length + " users found.");

    for (const row of rows) {
        let user: Profile = await db.get('SELECT * FROM Users WHERE id = $1;', [ row.id ]) as Profile;

        let entitlements: any[] = await db.all('SELECT * FROM Entitlements WHERE account = $1', [ user.id ]) as any[];

        entitlements = entitlements.filter((e: any) => {
            if (e.expires_at && new Date(e.expires_at) < new Date()) return false
            if (e.revoked) return false
            if (e.reward_type !== 'badge') return false
            if (e.reward_id !== user.badge) return false

            return true
        });

        let badge: Badge | null = user.badge ? await db.get('SELECT * FROM Badges WHERE id = $1;', [ user.badge ]) as Badge : null;

        if (!badge) {
            user.badge = null;
            await db.run('UPDATE Users SET badge = $1 WHERE id = $2;', [ null, user.id ]);
            continue;
        } else if (entitlements.length === 0) {
            user.badge = null;
            await db.run('UPDATE Users SET badge = $1 WHERE id = $2;', [ null, user.id ]);
            continue;
        }
    }
}