import type { Profile } from './profiles.js';

export interface PartialNotificationBase {
    id: string
    date: Date
    type: string
    isGroupable: boolean
    read: boolean
}

export interface PartialNotificationSingle extends PartialNotificationBase {
    author: Profile.id
}


export interface NotificationBase {
    id: string
    date: Date
    type: string
    isGroupable: boolean
    read: boolean
    author: Profile
}

export interface NotificationSingle extends NotificationBase {
    author: Profile
}

export interface PartialNotificationPost extends PartialNotificationSingle {
    target: string
}

export interface NotificationPost extends NotificationSingle {
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

export type Notification = NotificationSingle | NotificationWarn | NotificationBan;
export type PartialNotification = PartialNotificationSingle | PartialNotificationPost;

export type PartialInbox = {
    id: string
    requests: {
        children: Profile.id[]
        following: Profile.id[]
        followers: Profile.id[]
    }
    other: PartialNotificationSingle[]
}

export type Inbox = {
    id: string
    requests: {
        children: Profile[]
        following: Profile[]
        followers: Profile[]
    }
    other: Notification[]
}