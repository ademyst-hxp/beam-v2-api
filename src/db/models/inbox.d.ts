export interface NotificationSingle {
    id: string
    date: Date
    type: string
    isGroupable: boolean
    read: boolean
    author: string
}

export interface NotificationPost extends NotificationSingle {
    target: string
}

export interface NotificationWarn extends NotificationSingle {
    reason: string
}

export interface NotificationBan extends NotificationSingle {
    soft: boolean
    until: Date
    reason: string
}

export type Notification = NotificationSingle | NotificationWarn | NotificationBan;

export type Inbox = {
    id: string
    requests: {
        children: string[]
        following: string[]
        followers: string[]
    }
    other: Notification[]
}