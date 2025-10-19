export type Profile = {
    id: string,
    name: string,
    display_name: string | null,
    creation_date: string,
    update_date: string,
    followers: string[],
    following: string[],
    status: string | null,
    birthday: string | null,
    pronouns: string | null,
    account_type: string | null,
    level: number
}

export type Settings = {
    id: string,
    privacy: {
        profile_visibility: string,
        birthday_visibility: string,
        status_visibility: string,
        dms: string
    },
    appearance: {
        global_theme: string,
    }
}

export type ProfileSettings = {
    id: string,
    blocklist: string[], // IDs et IPs
    pending: {
        children: string[],
        followers: string[]
    },
    friends: string[],
    children: string[],
    parent: string | null,
    preferences: Settings
}