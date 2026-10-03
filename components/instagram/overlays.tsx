"use client";
import { useEffect, useRef, useState } from "react";
import {
  Search,
  Heart,
  Send,
  X,
  ImagePlus,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Check,
  Copy,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Avatar, Photo, Verified, getUser, mock, Post } from "./shared";
import { toast } from "sonner";
import { InstantResponse } from "./instant-response";
import { useSwipeGesture } from "@/lib/motion";
import { MotionCarousel } from "@/components/motion/carousel";

export function SidePanel({
  panel,
  onClose,
  onProfile,
  following,
  onFollow,
}: {
  panel: string | null;
  onClose: () => void;
  onProfile: (id: string) => void;
  following: string[];
  onFollow: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const users = mock.users.filter((user) =>
    `${user.username} ${user.name}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Sheet
      open={!!panel}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="left" className="ig-side-panel">
        <SheetTitle className="panel-title">{panel}</SheetTitle>
        <SheetDescription className="sr-only">
          {panel === "Search"
            ? "Find people and discover accounts"
            : "Your latest activity"}
        </SheetDescription>
        {panel === "Search" ? (
          <>
            <label className="search-field">
              <Search size={18} />
              <input
                aria-label="Search accounts"
                placeholder="Search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
              />
              {query && (
                <button aria-label="Clear search" onClick={() => setQuery("")}>
                  <X size={15} />
                </button>
              )}
            </label>
            <h3>{query ? "Search results" : "Discover people"}</h3>
            <div className="search-results">
              {users.map((user) => (
                <button
                  key={user.id}
                  className="search-result"
                  onClick={() => {
                    onProfile(user.id);
                    onClose();
                  }}
                >
                  <Avatar user={user} size={47} />
                  <span>
                    <strong>
                      {user.username}
                      {user.verified && <Verified />}
                    </strong>
                    <span>{user.name}</span>
                  </span>
                </button>
              ))}
              {!users.length && (
                <p className="no-results">
                  No accounts found. Try another name.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="activity-list">
            <h3>Today</h3>
            {mock.users.slice(0, 4).map((user, index) => (
              <div className="activity-row" key={user.id}>
                <button
                  onClick={() => {
                    onProfile(user.id);
                    onClose();
                  }}
                >
                  <Avatar user={user} size={44} />
                </button>
                <p>
                  <button
                    className="username"
                    onClick={() => {
                      onProfile(user.id);
                      onClose();
                    }}
                  >
                    {user.username}
                  </button>{" "}
                  {index === 1
                    ? "started following you."
                    : index === 2
                      ? "mentioned you in a comment: This made me think of you 🤍"
                      : "liked your photo."}{" "}
                  <span>{index + 1}h</span>
                </p>
                {index === 1 ? (
                  <button
                    className={
                      following.includes(user.id)
                        ? "secondary-button"
                        : "primary-button"
                    }
                    onClick={() => onFollow(user.id)}
                  >
                    {following.includes(user.id) ? "Following" : "Follow"}
                  </button>
                ) : (
                  <Photo
                    src={mock.explore[index].image}
                    alt="Your recent photo"
                  />
                )}
              </div>
            ))}
            <h3>This week</h3>
            <div className="activity-row">
              <Avatar user={mock.users[5]} size={44} />
              <p>
                <strong>{mock.users[5].username}</strong> and 12 others liked
                your photo. <span>2d</span>
              </p>
              <Photo src={mock.explore[5].image} alt="Your recent photo" />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function StoryViewer({
  index,
  onChange,
  onClose,
  onReply,
}: {
  index: number | null;
  onChange: (index: number) => void;
  onClose: () => void;
  onReply: (id: string, text: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reply, setReply] = useState("");
  const [liked, setLiked] = useState(false);
  const gesture = useSwipeGesture(
    {
      onLeft: () => {
        if (index !== null && index < 5) onChange(index + 1);
        else onClose();
      },
      onRight: () => {
        if (index !== null && index > 0) onChange(index - 1);
      },
      onDown: onClose,
      onHold: setHeld,
    },
    index !== null,
  );
  useEffect(() => {
    setProgress(0);
    setLiked(false);
    setReply("");
  }, [index]);
  useEffect(() => {
    if (index === null || paused || held) return;
    const timer = setInterval(
      () => setProgress((value) => Math.min(value + 1, 100)),
      90,
    );
    return () => clearInterval(timer);
  }, [index, paused, held]);
  useEffect(() => {
    if (progress >= 100 && index !== null) {
      setProgress(0);
      if (index < 5) onChange(index + 1);
      else onClose();
    }
  }, [progress, index, onChange, onClose]);
  const user = mock.users[index ?? 0];
  const image = mock.explore[(index ?? 0) % mock.explore.length];
  return (
    <Dialog
      open={index !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="story-dialog" showCloseButton={false}>
        <DialogTitle className="sr-only">
          {user.username}&apos;s story
        </DialogTitle>
        <DialogDescription className="sr-only">
          Swipe left or right to browse stories, swipe down to close, or hold to
          pause. Previous, next and pause buttons are also available.
        </DialogDescription>
        <button
          className="story-close icon-button"
          aria-label="Close story"
          onClick={onClose}
        >
          <X size={28} />
        </button>
        <div className="story-frame" {...gesture}>
          <Photo key={image.image} src={image.image} alt={image.alt} />
          <div className="story-shade" />
          <div className="story-progress">
            <span style={{ width: `${progress}%` }} />
          </div>
          <header className="story-header">
            <Avatar user={user} size={34} />
            <strong>{user.username}</strong>
            <span>2h</span>
            <button
              className="icon-button"
              aria-label={paused ? "Play story" : "Pause story"}
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play size={20} /> : <Pause size={20} />}
            </button>
          </header>
          <div className="story-caption">
            {
              [
                "a little bit of magic ✨",
                "out of office.",
                "somewhere I'd stay forever 🍋",
                "slow mornings 🤍",
                "the long way home",
                "a moment for this",
              ][index ?? 0]
            }
          </div>
          <form
            className="story-reply"
            onSubmit={(event) => {
              event.preventDefault();
              if (reply.trim()) {
                onReply(user.id, reply.trim());
                toast(`Reply to ${user.username} added to this demo session`);
                setReply("");
              }
            }}
          >
            <input
              aria-label="Reply to story"
              placeholder={`Reply to ${user.username}…`}
              value={reply}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              onChange={(event) => setReply(event.target.value)}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Like story"
              aria-pressed={liked}
              onClick={() => setLiked(!liked)}
            >
              <Heart fill={liked ? "var(--ig-like)" : "none"} />
            </button>
            <button
              className="icon-button"
              aria-label="Send reply"
              type="submit"
            >
              <Send />
            </button>
          </form>
        </div>
        {index !== null && index > 0 && (
          <button
            className="story-prev"
            aria-label="Previous story"
            onClick={() => onChange(index - 1)}
          >
            <ChevronLeft />
          </button>
        )}
        {index !== null && index < 5 && (
          <button
            className="story-next"
            aria-label="Next story"
            onClick={() => onChange(index + 1)}
          >
            <ChevronRight />
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PostDialog({
  post,
  onClose,
  comments,
  onAdd,
  liked,
  onLike,
  response,
  expiresAt,
  onRespond,
}: {
  post: Post | null;
  onClose: () => void;
  comments: { userId: string; text: string }[];
  onAdd: (text: string) => void;
  liked: boolean;
  onLike: () => void;
  response?: string;
  expiresAt?: number;
  onRespond: (option: string) => void;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText("");
  }, [post?.id]);
  if (!post) return null;
  const user = getUser(post.userId);
  return (
    <Dialog
      open={!!post}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="post-dialog">
        <DialogTitle className="sr-only">Post by {user.username}</DialogTitle>
        <DialogDescription className="sr-only">
          {post.alt}. Read and add comments.
        </DialogDescription>
        <div className="dialog-photo">
          <MotionCarousel
            key={post.id}
            images={post.images}
            alt={post.alt}
            onDoubleTap={() => {
              if (!liked) onLike();
            }}
          />
        </div>
        <div className="dialog-discussion">
          <header>
            <Avatar user={user} size={34} />
            <strong>{user.username}</strong>
            {user.verified && <Verified />}
          </header>
          <div className="dialog-comments">
            {post.instant && (
              <InstantResponse
                instant={post.instant}
                selected={response}
                expiresAt={expiresAt}
                onRespond={onRespond}
              />
            )}
            <div className="comment-row">
              <Avatar user={user} size={32} />
              <p>
                <strong>{user.username}</strong> {post.caption}
                <span>{post.time}</span>
              </p>
            </div>
            {[...post.comments, ...comments].map((comment, index) => (
              <div className="comment-row" key={index}>
                <Avatar user={getUser(comment.userId)} size={32} />
                <p>
                  <strong>{getUser(comment.userId).username}</strong>{" "}
                  {comment.text}
                  <span>
                    {index < post.comments.length ? "1h" : "Just now"} · Reply
                  </span>
                </p>
                <Heart size={12} />
              </div>
            ))}
          </div>
          <div className="dialog-likes">
            <button
              className={`icon-button ${liked ? "liked" : ""}`}
              aria-label={liked ? "Unlike post" : "Like post"}
              aria-pressed={liked}
              onClick={onLike}
            >
              <Heart fill={liked ? "currentColor" : "none"} />
            </button>
            <strong>
              {(post.likes + (liked ? 1 : 0)).toLocaleString()} likes
            </strong>
            <span>{post.time} ago</span>
          </div>
          <form
            className="dialog-comment-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim()) {
                onAdd(text.trim());
                setText("");
              }
            }}
          >
            <input
              aria-label="Write a comment"
              placeholder="Add a comment…"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <button
              type="submit"
              className="text-action"
              disabled={!text.trim()}
            >
              Post
            </button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CreateDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (image: string, caption: string) => void;
}) {
  const [image, setImage] = useState("");
  const [caption, setCaption] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) {
      setImage("");
      setCaption("");
    }
  }, [open]);
  function readFile(selected?: File) {
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast.error("Choose an image smaller than 10 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(selected);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="create-dialog">
        <DialogTitle className="dialog-title">Create an instant</DialogTitle>
        <DialogDescription className="sr-only">
          Choose a photo and write a caption. Your post will appear in this demo
          feed.
        </DialogDescription>
        {!image ? (
          <div
            className="upload-area"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              readFile(event.dataTransfer.files[0]);
            }}
          >
            <div className="upload-icon">
              <ImagePlus size={62} strokeWidth={1.2} />
            </div>
            <h2>Make something happen</h2>
            <p>Drag a photo here</p>
            <button
              className="primary-button"
              onClick={() => file.current?.click()}
            >
              Select from computer
            </button>
            <span>or start with a photo from the collection</span>
            <div className="sample-photos">
              {mock.explore.slice(0, 3).map((item) => (
                <button
                  key={item.image}
                  aria-label={`Select ${item.alt}`}
                  onClick={() => setImage(item.image)}
                >
                  <Photo src={item.image} alt={item.alt} />
                </button>
              ))}
            </div>
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => readFile(event.target.files?.[0])}
            />
          </div>
        ) : (
          <>
            <div className="create-preview">
              <Photo src={image} alt="New post preview" />
            </div>
            <div className="create-caption">
              <Avatar user={mock.currentUser} size={30} />
              <strong>{mock.currentUser.username}</strong>
              <textarea
                maxLength={2200}
                placeholder="Write a caption…"
                aria-label="Write a caption"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
              <div>
                <button className="text-action" onClick={() => setImage("")}>
                  Change photo
                </button>
                <span>{caption.length}/2,200</span>
              </div>
            </div>
            <button
              className="primary-button create-share"
              onClick={() => {
                onCreate(image, caption);
                onClose();
              }}
            >
              Share to your feed
            </button>
            <p className="demo-message-note">
              Open for 30 minutes. Quick responses enabled.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ShareDialog({
  post,
  onClose,
  onSend,
}: {
  post: Post | null;
  onClose: () => void;
  onSend: (ids: string[], post: Post) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    setSelected([]);
    setQuery("");
  }, [post?.id]);
  return (
    <Dialog
      open={!!post}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="share-dialog">
        <DialogTitle className="dialog-title">Share</DialogTitle>
        <DialogDescription className="sr-only">
          Choose people or copy a link to this post.
        </DialogDescription>
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="Search people"
            aria-label="Search people to share with"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="share-people">
          {mock.users
            .filter((user) =>
              user.name.toLowerCase().includes(query.toLowerCase()),
            )
            .slice(0, 6)
            .map((user) => (
              <button
                className="search-result"
                key={user.id}
                onClick={() =>
                  setSelected(
                    selected.includes(user.id)
                      ? selected.filter((id) => id !== user.id)
                      : [...selected, user.id],
                  )
                }
              >
                <Avatar user={user} size={44} />
                <span>
                  <strong>{user.name}</strong>
                  <span>{user.username}</span>
                </span>
                <i className={selected.includes(user.id) ? "checked" : ""}>
                  {selected.includes(user.id) && <Check size={14} />}
                </i>
              </button>
            ))}
        </div>
        <div className="share-footer">
          <button
            className="secondary-button"
            onClick={async () => {
              try {
                if (!mock.posts.some((item) => item.id === post?.id)) {
                  toast(
                    "This post is only available in your current preview session.",
                  );
                  return;
                }
                await navigator.clipboard.writeText(
                  `${window.location.origin}/?post=${post?.id}`,
                );
                toast("Link copied");
              } catch {
                toast.error("Clipboard isn't available in this browser.");
              }
            }}
          >
            <Copy size={16} /> Copy link
          </button>
          <button
            className="primary-button"
            disabled={!selected.length}
            onClick={() => {
              if (post) onSend(selected, post);
              toast(
                `Shared with ${selected.length} ${selected.length === 1 ? "person" : "people"} in this demo`,
              );
              onClose();
            }}
          >
            Send
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
