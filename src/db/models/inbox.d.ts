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

export interface PartialNotificationComment extends PartialNotificationSingle {
    target: string
    post: string
}

export interface NotificationPost extends NotificationSingle {
    target: string
}

export interface NotificationComment extends NotificationSingle {
    target: string
    post: string
}

export interface NotificationWarn extends NotificationBase {
    reason: string
}

export interface NotificationBan extends NotificationBase {
    soft: boolean
    until: Date
    reason: string
}

export type Notification = NotificationSingle | NotificationWarn | NotificationBan | NotificationPost | NotificationComment;
export type PartialNotification = PartialNotificationSingle | PartialNotificationPost | PartialNotificationComment;

export type PartialPendingRequest = {
    from: Profile.id
    to: Profile.id
    date: string
}

export type PendingRequest = {
    from: Profile
    to: Profile
    date: Date
}

export type PartialInbox = {
    id: string
    outgoing: {
        children: PartialPendingRequest[]
        follow: PartialPendingRequest[]
    }
    incoming: {
        children: PartialPendingRequest[]
        follow: PartialPendingRequest[]
    }
    other: PartialNotification[]
}

export type Inbox = {
    id: string
    outgoing: {
        children: PendingRequest[]
        follow: PendingRequest[]
    }
    incoming: {
        children: PendingRequest[]
        follow: PendingRequest[]
    }
    read: Notification[],
    unread: Notification[]
}