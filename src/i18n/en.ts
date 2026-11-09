import type { Dict } from "./th";

export const en: Dict = {
  app: { name: "TripSync AI", tagline: "Plan trips with friends — AI turns every shared link into a plan" },
  nav: { home: "Home", inbox: "Inbox", map: "Map", plan: "Plan", members: "Members", trips: "My trips", settings: "Settings", profile: "Profile" },
  auth: {
    login: "Log in", register: "Sign up", email: "Email", password: "Password", displayName: "Display name",
    magicLink: "Email me a login link", magicSent: "Login link sent — check your inbox",
    signout: "Sign out", noAccount: "No account?", haveAccount: "Have an account?", checkEmail: "Signed up. Confirm your email, then log in.",
    or: "or",
  },
  trips: {
    title: "My trips", create: "New trip", empty: "No trips yet", emptyHint: "Create your first trip or join a friend's with an invite code",
    join: "Join with code", joinPlaceholder: "8-char code or invite link", days: "days", members: "members", archived: "Archived",
  },
  form: {
    name: "Trip name", description: "Description", start: "Start point", end: "End point", startDate: "Start date", endDate: "End date",
    budget: "Total budget", currency: "Currency", memberCount: "Members (approx.)", travelMode: "Travel mode",
    dailyStart: "Daily start", dailyEnd: "Daily end", save: "Save", create: "Create trip", cancel: "Cancel",
    optional: "optional", more: "More settings",
  },
  travelMode: { car: "Car", motorbike: "Motorbike", public_transit: "Public transit", walking: "Walking", bicycle: "Bicycle", mixed: "Mixed" },
  role: { owner: "Owner", editor: "Editor", member: "Member" },
  members: {
    title: "Members", invite: "Invite friends", inviteCode: "Invite code", copyLink: "Copy link", copyCode: "Copy code", share: "Share",
    regenerate: "New code", regenerateConfirm: "The old code and link will stop working. Continue?",
    inviteDisabled: "Invites are off", enableInvite: "Enable invites", disableInvite: "Disable invites",
    remove: "Remove", removeConfirm: "Remove this member? Their suggestions stay in the trip.",
    leave: "Leave trip", leaveConfirm: "Leave this trip?", makeOwner: "Transfer ownership",
    makeOwnerConfirm: "You will become an editor and this member the owner.", you: "you", joined: "Joined",
    onlyEditors: "Only owners/editors can see the invite code",
  },
  join: { title: "Join trip", invalid: "Invite is invalid, expired or disabled", already: "You're already a member", cta: "Join trip", open: "Open trip" },
  overview: {
    dates: "Dates", budget: "Budget", daily: "Daily hours", route: "Route", quickAdd: "Paste a place link",
    quickAddSoon: "AI link analysis arrives in Phase 2", stats: "Trip summary", noBudget: "Not set",
  },
  settings: {
    title: "Trip settings", danger: "Danger zone", archive: "Archive trip", unarchive: "Unarchive",
    delete: "Delete trip", deleteConfirm: "Permanently delete this trip and all data. Type the trip name to confirm.",
    readOnly: "You have read-only access",
  },
  profile: { title: "Profile", color: "Colour", language: "Language" },
  phase: { soon: "Coming soon", soonBody: "This feature is planned for Phase {n} and not enabled yet" },
  common: { loading: "Loading…", error: "Something went wrong", retry: "Retry", saved: "Saved", copied: "Copied", confirm: "Confirm", back: "Back", offline: "Offline" },
  errors: {
    required: "Required", end_before_start: "End date is before start date", trip_too_long: "Trips can be at most 61 days",
    end_time_before_start: "End time must be after start time", invalid_invite: "Invalid invite code", forbidden: "You don't have permission",
    rate_limited: "Too many requests, try later", generic: "Something went wrong, please retry", trip_full: "This trip is full",
    invite_email_mismatch: "This invite was issued to a different email",
  },
};
