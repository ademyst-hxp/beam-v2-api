export type Session = {
  id: string,
  token: string;
  account: string;
  last_activity: string; // ISO
  ip: string | undefined;
};

export type Account = {
    id: string,
    username: string,
    password_hash: string,
    email: string
}