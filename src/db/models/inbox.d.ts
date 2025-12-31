export interface NotificationBase {
    id: string
    date: Date
    type: string
    isGroupable: boolean
    read: boolean
}

export interface NotificationGroup extends NotificationBase {
    authors: string[]
    target: string
}

export interface NotificationSingle extends NotificationBase {
    author: string
    target: string
}

export interface NotificationWarn extends NotificationBase {
    reason: string
}

export interface NotificationBan extends NotificationBase {
    soft: boolean
    until: Date
    reason: string
}

export type Notification = NotificationGroup | NotificationSingle | NotificationWarn | NotificationBan;

export type Inbox = {
    id: string
    requests: {
        children: string[]
        following: string[]
        followers: string[]
    }
    other: Notification[]
}