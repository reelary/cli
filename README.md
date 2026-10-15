# Reelary for AI agents

Talk to your footage. Reelary indexes the videos and photos already on your Mac or Windows PC and lets Claude, Cursor, Codex and other agents search every frame by meaning and cut the matches into a video. 100% local: nothing leaves your computer.

## Install

    npx reelary

Installs the signed Reelary app (runs in the background with a tray icon), connects it to Claude Code, Claude Desktop, Cursor and Codex, and adds the skills below.

Skills only (any of 60+ agents):

    npx skills add reelary/agent

Claude Code plugin (skills + MCP server):

    /plugin marketplace add reelary/agent
    /plugin install reelary@reelary

## What you can ask

- "Index ~/Movies and find drone shots of the coast."
- "Find b-roll for this voiceover: …"
- "Cut a 30-second 9:16 recap of my Lisbon trip."
- "Rough cut this script from my footage and export it for DaVinci Resolve."

## Skills

| Skill | For |
|---|---|
| reelary | Start here; routes to the others, installs and troubleshoots |
| find-footage | Find a shot by describing it |
| broll-finder | B-roll for a voiceover or interview |
| rough-cut | Script or shot list to an editable cut |
| script-to-video | Script or blog post to a finished video from your own footage |
| nle-export | FCPXML / XML / EDL for Premiere, Final Cut, Resolve (Pro) |
| media-library | Index and organize folders and drives |
| photo-search | Find photos by description |
| montage-maker | Montages, highlight reels, recaps |
| vertical-video | Shorts, Reels, TikTok (9:16, 1:1) |
| dialogue-search | Find what someone said (Pro) |
| footage-by-location | Footage by place, drone and GoPro GPS (Pro) |
| face-search | Every clip of a person (Pro) |

## Plans

Free: unlimited indexing, visual search, rough cuts; MP4 exports at 720p with a watermark, up to 60 seconds, 5 per month. Pro (one-time purchase, Mac + Windows): dialogue search, people, places, NLE export, full-quality unlimited exports. https://reelary.app/pricing

## CLI

    npx reelary status
    npx reelary index ~/Movies
    npx reelary search "sunset over water" --json
    npx reelary cut "Sunrise over the city. Coffee being poured." --aspect 9:16 --save Morning
    npx reelary export <project_id> [--nle fcpxml]
    npx reelary uninstall [--app]
