"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Search,
  Compass,
  Clapperboard,
  Send,
  Heart,
  SquarePlus,
  Menu,
  Zap,
  Moon,
  Sun,
  ChevronRight,
  Plus,
  Bookmark,
  Check,
} from "lucide-react";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster, toast } from "sonner";
import { brand, Theme } from "@/lib/brand";
import {
  HomeIcon,
  Avatar,
  Wordmark,
  PoweredBy,
  Verified,
  mock,
  Post,
} from "./shared";
import PostCard from "./post-card";
import { ExploreView, ProfileView, MessagesView, ReelsView } from "./views";
import {
  SidePanel,
  StoryViewer,
  PostDialog,
  CreateDialog,
  ShareDialog,
} from "./overlays";
import { useThemeTool } from "./use-theme-tool";
import { scrollToTop, prefersReducedMotion } from "@/lib/motion";

const nav = [
  { name: "Home", icon: HomeIcon },
  { name: "Search", icon: Search },
  { name: "Explore", icon: Compass },
  { name: "Reels", icon: Clapperboard },
  { name: "Messages", icon: Send },
  { name: "Notifications", icon: Heart },
  { name: "Create", icon: SquarePlus },
];
export default function InstantsApp() {
  const [theme, setTheme] = useState<Theme>(brand.defaultTheme as Theme);
  const [view, setView] = useState("Home");
  const [feed, setFeed] = useState("for-you");
  const [liked, setLiked] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>(
    mock.users.filter((user) => user.following).map((user) => user.id),
  );
  const [seen, setSeen] = useState<string[]>([]);
  const [panel, setPanel] = useState<string | null>(null);
  const [story, setStory] = useState<number | null>(null);
  const [activePost, setActivePost] = useState<Post | null>(null);
  const [sharePost, setSharePost] = useState<Post | null>(null);
  const [creating, setCreating] = useState(false);
  const [profileId, setProfileId] = useState("you");
  const scrollPositions = useRef<Record<string, number>>({});
  const viewKey = view === "Profile" ? `Profile:${profileId}` : view;
  const restoredView = useRef(viewKey);
  useLayoutEffect(() => {
    if (restoredView.current === viewKey) return;
    restoredView.current = viewKey;
    window.scrollTo({
      top: scrollPositions.current[viewKey] ?? 0,
      behavior: "instant",
    });
  }, [viewKey]);
  function showView(name: string, account = "you", reset = false) {
    const nextKey = name === "Profile" ? `Profile:${account}` : name;
    if (nextKey === viewKey) {
      scrollToTop();
      return;
    }
    scrollPositions.current[viewKey] = window.scrollY;
    if (reset) scrollPositions.current[nextKey] = 0;
    if (name === "Profile") setProfileId(account);
    setView(name);
  }
  const [allPosts, setAllPosts] = useState<Post[]>(mock.posts);
  const [comments, setComments] = useState<
    Record<string, { userId: string; text: string }[]>
  >({});
  const [threads, setThreads] = useState(mock.messages);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [deadlines, setDeadlines] = useState<Record<string, number>>({});
  useEffect(() => {
    const now = Date.now();
    setDeadlines(
      Object.fromEntries(
        mock.posts.map((post) => [
          post.id,
          now + post.instant.expiresInMinutes * 60_000,
        ]),
      ),
    );
  }, []);
  function respond(post: Post, option: string) {
    if (
      !post.instant?.options.some((item) => item.id === option) ||
      (deadlines[post.id] && deadlines[post.id] <= Date.now())
    )
      return;
    setResponses((current) => ({ ...current, [post.id]: option }));
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("post");
    const post = mock.posts.find((item) => item.id === id);
    if (post) setActivePost(post);
  }, []);
  useEffect(() => {
    setTheme(
      document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    );
  }, []);
  function applyTheme(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("ig-ui-theme", next);
    } catch {}
  }
  function switchTheme() {
    applyTheme(theme === "light" ? "dark" : "light");
  }
  useThemeTool(applyTheme);
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  function navigate(name: string) {
    if (name === "Search" || name === "Notifications") {
      setPanel(name);
      return;
    }
    if (name === "Create") {
      setCreating(true);
      return;
    }
    showView(name);
  }
  function openProfile(id: string) {
    showView("Profile", id);
  }
  function addComment(postId: string, text: string) {
    setComments((current) => ({
      ...current,
      [postId]: [...(current[postId] || []), { userId: "you", text }],
    }));
  }
  function openStory(index: number) {
    setStory(index);
    setSeen((current) =>
      current.includes(mock.users[index].id)
        ? current
        : [...current, mock.users[index].id],
    );
  }
  const dockView = panel === "Search" || view === "Explore" ? "Search" : view;
  const posts = allPosts
    .filter((post) => view !== "Saved" || saved.includes(post.id))
    .filter(
      (post) =>
        view === "Saved" ||
        feed !== "following" ||
        following.includes(post.userId) ||
        post.userId === "you",
    );
  return (
    <SidebarProvider className="ig-app">
      <Sidebar collapsible="none" className="ig-sidebar">
        <button
          className="brand"
          aria-label={`${brand.name} home`}
          onClick={() => navigate("Home")}
        >
          <Wordmark />
          <Zap className="compact-logo" size={27} />
        </button>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${view === item.name ? "active" : ""}`}
              aria-label={item.name}
              aria-current={view === item.name ? "page" : undefined}
              onClick={() => navigate(item.name)}
            >
              <span className="nav-icon">
                <item.icon
                  size={25}
                  strokeWidth={view === item.name ? 2.4 : 1.8}
                  fill={
                    item.name === "Home" && view === "Home"
                      ? "currentColor"
                      : "none"
                  }
                />
                {item.name === "Messages" && (
                  <span className="notification-badge">2</span>
                )}
              </span>
              <span className="nav-label">{item.name}</span>
            </button>
          ))}
          <button
            className={`nav-item ${view === "Profile" ? "active" : ""}`}
            aria-label="Profile"
            onClick={() => navigate("Profile")}
          >
            <Avatar user={mock.currentUser} size={26} />
            <span className="nav-label">Profile</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button
            className="nav-item theme-button"
            onClick={switchTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? (
              <Moon size={25} strokeWidth={1.8} />
            ) : (
              <Sun size={25} strokeWidth={1.8} />
            )}
            <span className="nav-label">
              {theme === "light" ? "Dark mode" : "Light mode"}
            </span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="nav-item" aria-label="More">
                <Menu size={25} strokeWidth={1.8} />
                <span className="nav-label">More</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              className="ig-menu more-menu"
            >
              <DropdownMenuItem onClick={() => navigate("Saved")}>
                <Bookmark size={18} /> Saved
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/motion">
                  <Zap size={18} /> Motion lab
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={switchTheme}>
                {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}{" "}
                Switch appearance
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  toast("You're viewing a UI prototype with sample content.")
                }
              >
                About this prototype
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <PoweredBy className="sidebar-credit" />
        </div>
      </Sidebar>
      <header className="mobile-header">
        <div className="mobile-brand">
          <button
            onClick={() => navigate("Home")}
            aria-label={`${brand.name} home`}
          >
            <Wordmark />
          </button>
          <PoweredBy />
        </div>
        <div>
          <button
            className="icon-button"
            onClick={switchTheme}
            aria-label="Switch appearance"
          >
            {theme === "light" ? <Moon /> : <Sun />}
          </button>
          <button
            className="icon-button"
            aria-label="Create"
            onClick={() => navigate("Create")}
          >
            <SquarePlus />
          </button>
          <button
            className="icon-button"
            aria-label="Notifications"
            onClick={() => navigate("Notifications")}
          >
            <Heart />
          </button>
        </div>
      </header>
      <main
        key={viewKey}
        className={`ig-main ${view === "Messages" ? "messages-main" : ""}`}
      >
        {view === "Explore" && (
          <ExploreView
            onOpen={setActivePost}
            onSearch={() => setPanel("Search")}
          />
        )}
        {view === "Profile" && (
          <ProfileView
            key={profileId}
            userId={profileId}
            posts={allPosts}
            saved={saved}
            following={following}
            onFollow={() => setFollowing(toggle(following, profileId))}
            onOpen={setActivePost}
            onSaved={() => navigate("Home")}
            onEdit={switchTheme}
          />
        )}
        {view === "Messages" && (
          <MessagesView
            onProfile={openProfile}
            threads={threads}
            setThreads={setThreads}
          />
        )}
        {view === "Reels" && <ReelsView onOpen={setActivePost} />}
        {(view === "Home" || view === "Saved") && (
          <div className="home-layout">
            <section className="feed-column" aria-label="Feed">
              <div className="feed-tabs-row">
                <Tabs value={feed} onValueChange={setFeed}>
                  <TabsList variant="line" className="feed-tabs">
                    <TabsTrigger value="for-you">
                      {view === "Saved" ? "Saved posts" : "Live now"}
                    </TabsTrigger>
                    {view !== "Saved" && (
                      <TabsTrigger value="following">Following</TabsTrigger>
                    )}
                  </TabsList>
                </Tabs>
                <span className="feed-wordmark">{brand.tagline}</span>
                {view !== "Saved" && (
                  <span className="live-feed-status">
                    <i />
                    {posts.length} moments
                  </span>
                )}
              </div>
              {view !== "Saved" && (
                <div className="stories" aria-label="Stories">
                  <button
                    className="story your-story"
                    onClick={() => navigate("Create")}
                  >
                    <span className="own-story-wrap">
                      <Avatar user={mock.currentUser} size={64} />
                      <span className="add-story">
                        <Plus size={13} strokeWidth={3} />
                      </span>
                    </span>
                    <span>Your story</span>
                  </button>
                  {mock.users.slice(0, 6).map((user, index) => (
                    <button
                      className="story"
                      key={user.id}
                      onClick={() => openStory(index)}
                    >
                      <Avatar
                        user={user}
                        size={66}
                        ring
                        seen={seen.includes(user.id)}
                      />
                      <span>{user.username}</span>
                    </button>
                  ))}
                  <button
                    className="stories-next"
                    aria-label="More stories"
                    onClick={(event) =>
                      event.currentTarget.parentElement?.scrollBy({
                        left: 250,
                        behavior: prefersReducedMotion() ? "instant" : "smooth",
                      })
                    }
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              )}
              <div className="posts">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={{
                      ...post,
                      commentCount:
                        post.commentCount + (comments[post.id]?.length || 0),
                    }}
                    liked={liked.includes(post.id)}
                    saved={saved.includes(post.id)}
                    onLike={() => setLiked(toggle(liked, post.id))}
                    onSave={() => {
                      setSaved(toggle(saved, post.id));
                      toast(
                        saved.includes(post.id)
                          ? "Removed from saved"
                          : "Saved to your collection",
                      );
                    }}
                    onComment={(text) => {
                      if (text) {
                        addComment(post.id, text);
                        toast("Comment added");
                      }
                      setActivePost(post);
                    }}
                    onShare={() => setSharePost(post)}
                    onProfile={openProfile}
                    response={responses[post.id]}
                    expiresAt={deadlines[post.id]}
                    onRespond={(option) => respond(post, option)}
                  />
                ))}
                {!posts.length && (
                  <div className="empty-state">
                    <Bookmark size={44} />
                    <h2>Save the things you love</h2>
                    <p>Posts you save will appear here.</p>
                    <button
                      className="primary-button"
                      onClick={() => navigate("Home")}
                    >
                      Explore your feed
                    </button>
                  </div>
                )}
                {!!posts.length && (
                  <div className="caught-up">
                    <span>
                      <Check size={28} />
                    </span>
                    <h3>You&apos;re all caught up</h3>
                    <p>More moments are just around the corner.</p>
                    <button className="text-action" onClick={scrollToTop}>
                      Back to top
                    </button>
                    <a className="motion-lab-link" href="/motion">
                      Explore the motion lab <ChevronRight size={14} />
                    </a>
                  </div>
                )}
              </div>
            </section>
            <aside className="suggestions">
              <div className="account-row current-account">
                <button onClick={() => navigate("Profile")}>
                  <Avatar user={mock.currentUser} size={46} />
                </button>
                <button
                  className="account-info"
                  onClick={() => navigate("Profile")}
                >
                  <strong>{mock.currentUser.username}</strong>
                  <span>{mock.currentUser.name}</span>
                </button>
                <button
                  className="text-action"
                  onClick={() =>
                    toast("You're using the Alex Morgan demo account.")
                  }
                >
                  Switch
                </button>
              </div>
              <div className="suggestions-heading">
                <h2>Suggested for you</h2>
                <button onClick={() => navigate("Explore")}>See All</button>
              </div>
              {mock.users.slice(5).map((user, i) => (
                <div className="account-row" key={user.id}>
                  <button onClick={() => openProfile(user.id)}>
                    <Avatar user={user} size={44} />
                  </button>
                  <button
                    className="account-info"
                    onClick={() => openProfile(user.id)}
                  >
                    <strong>
                      {user.username}
                      {user.verified && <Verified />}
                    </strong>
                    <span>
                      {i === 0
                        ? "Followed by ellawilliams + 3 more"
                        : i === 2
                          ? "Followed by james.chen"
                          : "Suggested for you"}
                    </span>
                  </button>
                  <button
                    className={`text-action ${following.includes(user.id) ? "is-following" : ""}`}
                    onClick={() => setFollowing(toggle(following, user.id))}
                  >
                    {following.includes(user.id) ? "Following" : "Follow"}
                  </button>
                </div>
              ))}
              <footer className="side-footer">
                <p>{brand.tagline}</p>
                <PoweredBy />
                <p className="footer-copyright">
                  &copy; {new Date().getFullYear()} {brand.name}
                </p>
              </footer>
            </aside>
          </div>
        )}
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <span
          className="dock-selection"
          aria-hidden="true"
          style={{
            transform: `translateX(${Math.max(0, ["Home", "Reels", "Messages", "Search", "Profile"].indexOf(dockView)) * 100}%)`,
          }}
        />
        {[nav[0], nav[3], nav[4], nav[1]].map((item) => (
          <button
            className={`dock-button ${dockView === item.name ? "active" : ""}`}
            key={item.name}
            aria-label={item.name}
            aria-current={dockView === item.name ? "page" : undefined}
            onClick={() =>
              navigate(item.name === "Search" ? "Explore" : item.name)
            }
          >
            <span className="dock-icon">
              <item.icon
                fill={
                  item.name === view && view === "Home"
                    ? "currentColor"
                    : "none"
                }
              />
              {item.name === "Messages" &&
                threads.some((thread) => thread.unread) && (
                  <span className="dock-unread" />
                )}
            </span>
          </button>
        ))}
        <button
          className={`dock-button ${view === "Profile" ? "active" : ""}`}
          aria-label="Profile"
          aria-current={view === "Profile" ? "page" : undefined}
          onClick={() => navigate("Profile")}
        >
          <Avatar user={mock.currentUser} size={25} />
        </button>
      </nav>
      <SidePanel
        panel={panel}
        onClose={() => setPanel(null)}
        onProfile={openProfile}
        following={following}
        onFollow={(id) => setFollowing(toggle(following, id))}
      />
      <StoryViewer
        index={story}
        onChange={openStory}
        onClose={() => setStory(null)}
        onReply={(userId, text) =>
          setThreads((current) => {
            const index = current.findIndex(
              (thread) => thread.userId === userId,
            );
            if (index < 0)
              return [
                {
                  userId,
                  preview: `You: ${text}`,
                  time: "now",
                  unread: false,
                  messages: [{ mine: true, text }],
                },
                ...current,
              ];
            return current.map((thread, i) =>
              i === index
                ? {
                    ...thread,
                    preview: `You: ${text}`,
                    time: "now",
                    messages: [...thread.messages, { mine: true, text }],
                  }
                : thread,
            );
          })
        }
      />
      <PostDialog
        post={activePost}
        onClose={() => setActivePost(null)}
        comments={activePost ? comments[activePost.id] || [] : []}
        onAdd={(text) => {
          if (activePost) addComment(activePost.id, text);
        }}
        liked={!!activePost && liked.includes(activePost.id)}
        onLike={() => {
          if (activePost) setLiked(toggle(liked, activePost.id));
        }}
        response={activePost ? responses[activePost.id] : undefined}
        expiresAt={activePost ? deadlines[activePost.id] : undefined}
        onRespond={(option) => {
          if (activePost) respond(activePost, option);
        }}
      />
      <ShareDialog
        post={sharePost}
        onClose={() => setSharePost(null)}
        onSend={(ids, post) => {
          setThreads((current) => {
            const next = [...current];
            for (const id of ids) {
              const text = `Shared a post: ${post.caption}`;
              const index = next.findIndex((thread) => thread.userId === id);
              if (index >= 0)
                next[index] = {
                  ...next[index],
                  preview: "You shared a post",
                  time: "now",
                  messages: [...next[index].messages, { mine: true, text }],
                };
              else
                next.unshift({
                  userId: id,
                  preview: "You shared a post",
                  time: "now",
                  unread: false,
                  messages: [{ mine: true, text }],
                });
            }
            return next;
          });
        }}
      />
      <CreateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={(image, caption) => {
          const newPost: Post = {
            id: `local-${Date.now()}`,
            userId: "you",
            location: "Just shared",
            time: "now",
            images: [image],
            alt: caption || "Your new photo",
            caption,
            tags: "",
            likes: 0,
            commentCount: 0,
            comments: [],
            instant: {
              kind: "invite",
              title:
                caption.split("\n")[0].slice(0, 80) ||
                "Who is in for this moment?",
              expiresInMinutes: 30,
              options: [
                { id: "in", label: "I'm in", count: 0 },
                { id: "more", label: "Tell me more", count: 0 },
              ],
            },
          };
          setDeadlines((current) => ({
            ...current,
            [newPost.id]: Date.now() + 30 * 60_000,
          }));
          setAllPosts((current) => [newPost, ...current]);
          setFeed("for-you");
          showView("Home", "you", true);
          toast("Your moment has been shared to the demo feed");
        }}
      />
      <Toaster
        position="bottom-center"
        theme={theme}
        toastOptions={{
          style: {
            background: "var(--ig-surface)",
            color: "var(--ig-foreground)",
            borderColor: "var(--ig-border)",
          },
        }}
      />
    </SidebarProvider>
  );
}
