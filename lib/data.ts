export type Company = {
  id: string;
  name: string;
  handle: string;
  description: string;
  color: string;
  initials: string;
};
export type User = {
  id: string;
  username: string;
  name: string;
  avatar: string;
  verified: boolean;
  following: boolean;
  companyId: string;
  role: string;
};
export type Instant = {
  kind: string;
  title: string;
  expiresInMinutes: number;
  options: { id: string; label: string; count: number }[];
};
export type Comment = { userId: string; text: string };
export type Post = {
  id: string;
  userId: string;
  companyId?: string;
  requesterId?: string;
  workType?: string;
  location: string;
  time: string;
  images: string[];
  alt: string;
  caption: string;
  body?: string;
  tags: string;
  likes: number;
  commentCount: number;
  comments: Comment[];
  instant?: Instant;
  source?: { id: string; label: string; nativeId?: string; readOnly: boolean };
  occurredAt?: string;
  expiresAt?: string;
};
export type Message = { mine: boolean; text: string };
export type Thread = {
  id?: string;
  title?: string;
  readOnly?: boolean;
  sourceId?: string;
  userId: string;
  preview: string;
  time: string;
  unread: boolean;
  messages: Message[];
};
export type AttentionKind = "dm" | "comment" | "mention" | "review";
export type AttentionItem = {
  id: string;
  userId: string;
  companyId: string;
  kind: AttentionKind;
  postId?: string;
  title: string;
  preview: string;
  time: string;
  priority: "urgent" | "normal";
  messages: Message[];
  readOnly?: boolean;
  resolved?: boolean;
  sourceId?: string;
  expiresAt?: string;
};
export type QueueItem = AttentionItem & {
  resolved: boolean;
  replies: Message[];
};
export type SeedData = {
  sources?: {
    id: string;
    label: string;
    provider: string;
    readOnly: boolean;
    status?: "ready" | "stale" | "error" | "disconnected";
    description?: string;
    updatedAt?: string;
  }[];
  companies: Company[];
  currentUser: Omit<User, "following" | "verified"> & {
    bio: string;
    followers: string;
    following: number;
    companyIds: string[];
  };
  users: User[];
  posts: Post[];
  attention: AttentionItem[];
  messages: Thread[];
  explore: { image: string; alt: string; category: string; likes: string }[];
};
