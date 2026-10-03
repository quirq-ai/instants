"use client";
import { useEffect, useRef, useState } from "react";
import {
  Search,
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Grid3X3,
  Contact,
  Settings,
  ChevronDown,
  PenSquare,
  Phone,
  Video,
  Info,
  Smile,
  ArrowLeft,
  Play,
  Music2,
  VolumeX,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { brand } from "@/lib/brand";
import { useSwipeGesture, prefersReducedMotion } from "@/lib/motion";
import { Avatar, Photo, Verified, getUser, mock, Post } from "./shared";

export function ExploreView({
  onOpen,
  onSearch,
}: {
  onOpen: (post: Post) => void;
  onSearch: () => void;
}) {
  const [category, setCategory] = useState("For you");
  const [query, setQuery] = useState("");
  const items = mock.explore.filter(
    (item) =>
      (category === "For you" || item.category === category) &&
      `${item.alt} ${item.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="explore-page">
      <div className="page-heading">
        <div>
          <h1>Explore</h1>
          <p>Find your next spontaneous moment.</p>
        </div>
        <label className="search-field explore-search">
          <Search size={18} />
          <input
            placeholder="Search inspiration"
            aria-label="Search inspiration"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <button className="explore-people-search search-field" onClick={onSearch}>
        <Search size={18} />
        Search people and moments
      </button>
      <Tabs value={category} onValueChange={setCategory}>
        <TabsList className="category-tabs">
          {["For you", "Travel", "Architecture", "Nature", "Style", "Food"].map(
            (item) => (
              <TabsTrigger key={item} value={item}>
                {item}
              </TabsTrigger>
            ),
          )}
        </TabsList>
      </Tabs>
      <div className="explore-grid">
        {items.map((item, index) => (
          <button
            className={`explore-tile ${category === "For you" && index === 2 ? "tall" : ""}`}
            key={item.image}
            aria-label={`Open ${item.alt}`}
            onClick={() =>
              onOpen({
                ...mock.posts[index % mock.posts.length],
                id: `explore-${mock.explore.indexOf(item)}`,
                images: [item.image],
                alt: item.alt,
                caption: item.alt,
                location: item.category,
                instant: undefined,
              })
            }
          >
            <Photo src={item.image} alt={item.alt} />
            {index === 2 && (
              <Play className="tile-type" fill="white" size={22} />
            )}
            <span className="tile-overlay">
              <Heart fill="white" size={22} />
              {item.likes}
              <MessageCircle fill="white" size={22} />
              48
            </span>
          </button>
        ))}
      </div>
      {!items.length && (
        <div className="empty-state">
          <Search size={40} />
          <h2>No results found</h2>
          <p>Try a different word or category.</p>
        </div>
      )}
    </section>
  );
}

export function ProfileView({
  userId,
  posts,
  saved,
  following,
  onFollow,
  onOpen,
  onSaved,
  onEdit,
}: {
  userId: string;
  posts: Post[];
  saved: string[];
  following: string[];
  onFollow: () => void;
  onOpen: (post: Post) => void;
  onSaved: () => void;
  onEdit: () => void;
}) {
  const [tab, setTab] = useState("posts");
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({
    name: mock.currentUser.name,
    bio: mock.currentUser.bio,
  });
  const [draft, setDraft] = useState(profile);
  const user = getUser(userId);
  const own = userId === "you";
  const selected =
    tab === "saved"
      ? posts.filter((post) => saved.includes(post.id))
      : tab === "tagged"
        ? []
        : own
          ? posts.filter((post) => post.userId === "you")
          : posts.filter((post) => post.userId === userId);
  const gallery =
    own && tab === "posts"
      ? [
          ...selected,
          ...mock.explore.slice(0, 6).map((item, index) => ({
            ...mock.posts[index % 4],
            instant: undefined,
            id: `profile-${index}`,
            userId: "you",
            images: [item.image],
            alt: item.alt,
            caption: item.alt,
          })),
        ]
      : selected;
  return (
    <section className="profile-page">
      <header className="profile-header">
        <Avatar user={user} size={150} ring />
        <div className="profile-details">
          <div className="profile-title">
            <h1>{user.username}</h1>
            {user.verified && <Verified />}
            {own ? (
              <>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setDraft(profile);
                    setEditing(true);
                  }}
                >
                  Edit profile
                </button>
                <button
                  className="icon-button"
                  aria-label="Appearance settings"
                  onClick={onEdit}
                >
                  <Settings size={22} />
                </button>
              </>
            ) : (
              <button
                className={
                  following.includes(userId)
                    ? "secondary-button"
                    : "primary-button"
                }
                onClick={onFollow}
              >
                {following.includes(userId) ? "Following" : "Follow"}
              </button>
            )}
          </div>
          <div className="profile-stats">
            <span>
              <strong>{gallery.length}</strong> posts
            </span>
            <span>
              <strong>{own ? mock.currentUser.followers : "12.8K"}</strong>{" "}
              followers
            </span>
            <span>
              <strong>{own ? mock.currentUser.following : "482"}</strong>{" "}
              following
            </span>
          </div>
          <strong>{own ? profile.name : user.name}</strong>
          <p className="profile-bio">
            {own
              ? profile.bio
              : "Finding beauty in the everyday.\nPhotos, places, and everything in between. ✨"}
          </p>
          <span className="profile-link">
            {own ? "London, United Kingdom" : "Personal blog"}
          </span>
        </div>
      </header>
      <div className="highlights">
        {["Little moments", "On the road", "At home", "Favorites"].map(
          (label, index) => (
            <button
              key={label}
              onClick={() =>
                onOpen({
                  ...mock.posts[index],
                  id: `highlight-${index}`,
                  instant: undefined,
                  images: [mock.explore[index].image],
                })
              }
            >
              <span>
                <Photo src={mock.explore[index].image} alt={label} />
              </span>
              <strong>{label}</strong>
            </button>
          ),
        )}
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="profile-tabs">
          <TabsTrigger value="posts">
            <Grid3X3 size={13} /> POSTS
          </TabsTrigger>
          {own && (
            <TabsTrigger value="saved">
              <Bookmark size={13} /> SAVED
            </TabsTrigger>
          )}
          <TabsTrigger value="tagged">
            <Contact size={13} /> TAGGED
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="profile-grid">
        {gallery.map((post) => (
          <button
            key={post.id}
            onClick={() => onOpen(post)}
            aria-label={`Open ${post.alt}`}
          >
            <Photo src={post.images[0]} alt={post.alt} />
            <span className="tile-overlay">
              <Heart fill="white" />
              {post.likes.toLocaleString()}
            </span>
          </button>
        ))}
      </div>
      {!gallery.length && (
        <div className="empty-state">
          {tab === "saved" ? <Bookmark size={42} /> : <Contact size={42} />}
          <h2>{tab === "saved" ? "Save your inspiration" : "Photos of you"}</h2>
          <p>
            {tab === "saved"
              ? "The posts you save will be collected here."
              : "Photos you're tagged in will appear here."}
          </p>
          {tab === "saved" && (
            <button className="text-action" onClick={onSaved}>
              Browse your feed
            </button>
          )}
        </div>
      )}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="edit-profile-dialog">
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Make this little corner of the world yours.
          </DialogDescription>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setProfile(draft);
              setEditing(false);
            }}
          >
            <label>
              Name
              <input
                value={draft.name}
                required
                maxLength={60}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </label>
            <label>
              Bio
              <textarea
                value={draft.bio}
                maxLength={150}
                onChange={(event) =>
                  setDraft({ ...draft, bio: event.target.value })
                }
              />
            </label>
            <button className="primary-button" type="submit">
              Save changes
            </button>
            <p className="demo-message-note">
              Changes apply to this profile preview.
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function MessagesView({
  onProfile,
  threads,
  setThreads,
}: {
  onProfile: (id: string) => void;
  threads: typeof mock.messages;
  setThreads: React.Dispatch<React.SetStateAction<typeof mock.messages>>;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const thread = threads.find((item) => item.userId === active);
  const person = active ? getUser(active) : null;
  const [notice, setNotice] = useState("");
  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "instant" : "smooth",
      block: "nearest",
    });
  }, [threads, active]);
  function send() {
    if (!text.trim() || !active) return;
    setThreads((current) =>
      current.map((item) =>
        item.userId === active
          ? {
              ...item,
              preview: `You: ${text}`,
              time: "now",
              messages: [...item.messages, { mine: true, text: text.trim() }],
            }
          : item,
      ),
    );
    setText("");
  }
  return (
    <section className={`messages-page ${active ? "has-conversation" : ""}`}>
      <aside className="inbox">
        <header>
          <h1>
            {mock.currentUser.username}
            <ChevronDown size={18} />
          </h1>
          <button
            className="icon-button"
            aria-label="New message"
            onClick={() => {
              setQuery("");
              setNotice("Choose someone below to start a conversation.");
            }}
          >
            <PenSquare />
          </button>
        </header>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search messages"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="inbox-label">
          <strong>Messages</strong>
          <span>Requests</span>
        </div>
        {notice && <p className="inline-notice">{notice}</p>}
        {threads
          .filter((item) =>
            getUser(item.userId)
              .name.toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((item) => {
            const user = getUser(item.userId);
            return (
              <button
                key={item.userId}
                className={`thread-row ${active === item.userId ? "selected" : ""}`}
                onClick={() => {
                  setActive(item.userId);
                  setThreads(
                    threads.map((t) =>
                      t.userId === item.userId ? { ...t, unread: false } : t,
                    ),
                  );
                  setNotice("");
                }}
              >
                <Avatar user={user} size={55} />
                <span>
                  <strong>{user.name}</strong>
                  <span>
                    {item.preview} · {item.time}
                  </span>
                </span>
                {item.unread && <i />}
              </button>
            );
          })}
      </aside>
      <div className="conversation">
        {person && thread ? (
          <>
            <header className="conversation-header">
              <button
                className="icon-button back-to-inbox"
                aria-label="Back to inbox"
                onClick={() => setActive(null)}
              >
                <ArrowLeft />
              </button>
              <button onClick={() => onProfile(person.id)}>
                <Avatar user={person} size={40} />
              </button>
              <button
                className="conversation-person"
                onClick={() => onProfile(person.id)}
              >
                <strong>{person.name}</strong>
                <span>Active now</span>
              </button>
              <button
                className="icon-button"
                aria-label="Audio call"
                onClick={() =>
                  setNotice(
                    "Calls will be available when messaging is connected.",
                  )
                }
              >
                <Phone />
              </button>
              <button
                className="icon-button"
                aria-label="Video call"
                onClick={() =>
                  setNotice(
                    "Video calls will be available when messaging is connected.",
                  )
                }
              >
                <Video />
              </button>
              <button
                className="icon-button"
                aria-label="View profile"
                onClick={() => onProfile(person.id)}
              >
                <Info />
              </button>
            </header>
            {notice && <p className="inline-notice">{notice}</p>}
            <div className="message-history">
              <div className="conversation-intro">
                <Avatar user={person} size={90} />
                <h2>{person.name}</h2>
                <p>
                  {person.username} · {brand.name}
                </p>
                <button
                  className="secondary-button"
                  onClick={() => onProfile(person.id)}
                >
                  View profile
                </button>
              </div>
              <p className="message-date">Today, 10:24 AM</p>
              {thread.messages.map((message, index) => (
                <div
                  key={index}
                  className={`message-bubble ${message.mine ? "mine" : "theirs"}`}
                >
                  {message.text}
                </div>
              ))}
              <div ref={bottom} />
            </div>
            <form
              className="message-input"
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              <button
                type="button"
                className="icon-button"
                aria-label="Insert smile emoji"
                onClick={() => setText(text + " 😊")}
              >
                <Smile />
              </button>
              <input
                placeholder="Message…"
                aria-label="Message"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              <button
                type="submit"
                className="text-action"
                disabled={!text.trim()}
              >
                Send
              </button>
            </form>
            <p className="demo-message-note">
              Demo conversation · messages stay in this session
            </p>
          </>
        ) : (
          <div className="empty-state message-empty">
            <div className="outlined-icon">
              <Send size={43} />
            </div>
            <h2>Your messages</h2>
            <p>Send a little hello. Share a little moment.</p>
            <button
              className="primary-button"
              onClick={() => setActive(threads[0].userId)}
            >
              Send message
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export function ReelsView({ onOpen }: { onOpen: (post: Post) => void }) {
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState(false);
  const item = mock.explore[index];
  const user = getUser(mock.posts[index % 4].userId);
  function advance(delta: number) {
    setIndex(
      (current) =>
        (current + delta + mock.explore.length) % mock.explore.length,
    );
    setLiked(false);
  }
  const gesture = useSwipeGesture({
    onUp: () => advance(1),
    onDown: () => advance(-1),
  });
  return (
    <section className="reels-page">
      <div className="reel-player" {...gesture}>
        <Photo key={item.image} src={item.image} alt={item.alt} />
        <div className="reel-top">
          <strong>Reels</strong>
          <span>Photo preview</span>
          <VolumeX size={20} />
        </div>
        <div className="reel-gradient" />
        <div className="reel-copy">
          <div>
            <Avatar user={user} size={34} />
            <strong>{user.username}</strong>
            <Verified />
          </div>
          <p>{item.alt}. A moment worth keeping. ✨</p>
          <span>
            <Music2 size={14} /> Original audio · {user.username}
          </span>
        </div>
      </div>
      <div className="reel-actions">
        <button
          className={`icon-button ${liked ? "liked" : ""}`}
          aria-label="Like reel"
          aria-pressed={liked}
          onClick={() => setLiked(!liked)}
        >
          <Heart fill={liked ? "currentColor" : "none"} />
        </button>
        <small>{item.likes}</small>
        <button
          className="icon-button"
          aria-label="Reel comments"
          onClick={() =>
            onOpen({
              ...mock.posts[index % 4],
              id: `reel-${index}`,
              instant: undefined,
              images: [item.image],
            })
          }
        >
          <MessageCircle />
        </button>
        <small>48</small>
        <button
          className="icon-button"
          aria-label="Next reel"
          onClick={() => advance(1)}
        >
          <ChevronDown />
        </button>
        <small>Next</small>
      </div>
    </section>
  );
}
