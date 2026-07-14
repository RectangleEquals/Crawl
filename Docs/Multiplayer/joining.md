# Joining a Session (for players)

How players get into a world — the **target** login flow, and the **direct-URL interim** you can use today.

## Target flow (Phase 2+)

```
launch game (browser)
  → LOGIN PAGE with a REGION dropdown (e.g. US West, EU)   ← you're not on any server yet
  → sign in / create account on that region
  → SERVER BROWSER:  [Official] [Community]  — search/filter by name · ping · last activity · 🔒 password
       join a listed server           (enter password if 🔒)
       or create/enter a custom private server (name + optional password)
  → you're placed into that world (≤5 players) and play
```

- **Pick your region first** — you connect to that region's directory service, which holds your account,
  characters, chat, and the server list. **Official** and **Community** servers are on separate tabs;
  community worlds are player-run and may be password-protected.
- **Realms don't mix:** an *official* character can only play official servers, an *unofficial* (community)
  character only community servers — each has its own ladder.
- **If you disconnect from the region you're dropped from the world too**, and must log in again.

### Joining a world that's already in progress

If a party has already started a world and hasn't invited you, you join as a **visitor**: you appear in
their most-recent **Rest Sanctum**, can look around and even **spectate** the party out adventuring, but you
**can't leave the Sanctum or touch their stash/world** — it's a safe waiting room. Ask to join in **World
chat** (type `>Can I join?`) or message a player privately (`@TheirName hi`). The party leader can then hold
a quick vote to accept you (or, if you misbehave, kick/timeout/ban you). If they beat a boss while you wait,
you're automatically moved forward to the new Sanctum. When you're accepted and there's a free slot, you
join the run for real.

**Sleeping & your seat:** when a party sleeps at a Sanctum they *reserve their seats* in that world for about
a week so they can resume together — the server list shows those seats as filled, with a tooltip splitting
**awake vs sleeping**. If you take a character that's sleeping in one world into a *different* server, the
game warns you first: you'll give up that reserved seat (though your stash/gravemarks there stay yours).

**Chat channels** (type the prefix): `#` global · `$` trade (only in a Sanctum) · `>` this server ·
`%` your party · `@Name` private message.

## Interim (right now) — direct URL

Until the login/region/browser UI exists, your host shares a direct URL:

1. Open it in **Chrome**: `http://their.host:5173/?name=YourName` (or `:8080` on a one-port server).
2. Change `YourName`; the page connects automatically and drops you into the shared chamber.
3. **Click once** to capture the mouse (first-person look); **Esc** releases it.

## Controls

**KB/M:** WASD move · Space jump · Shift sprint · V first/third-person · Mouse look · **LMB** strike ·
**RMB** block (soaks frontal hits, charges Bulwark) · **Q** ward wall · **E** shield-slam (knock enemies up)
· **F** ground-slam (smash a knocked-up enemy — the combo) · 1/2/3 resolution · Esc release.

**Gamepad** (auto-detected): sticks move/look · A jump · L3 sprint · RT strike · LT block · X ward · RB
shield-slam · D-pad-down ground-slam · Y camera.

**Touch:** on-screen stick + jump/camera appear automatically (combat is KB/M or gamepad for now).

## What to expect

- Everyone spawns as a **Warden** in the same chamber, with enemies to fight and any ally bots.
- Combat is **server-authoritative** — hits/blocks/abilities are confirmed by the world server; no cheating
  each other. HUD (bottom): green→red **HP**, blue **Bulwark** (charge by blocking/taking hits, spend on
  Q/E/F), and ability readiness.
- Early test build: expect rough edges, no menus/lobbies yet, and a get-back-up-after-wipe placeholder.

## Troubleshooting

- **No name?** add `?name=You` to the URL. **Laggy?** add `?lowfx=1`. **Blank/can't connect?** the host's
  server may be down or the port not forwarded — ask them; it's only up when they run it.
- **Looks pixelated on purpose** — that's the PSX-retro style. Use a recent **Chrome** (WebGL + WebAssembly
  required).
