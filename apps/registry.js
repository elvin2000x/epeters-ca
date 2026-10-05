/* ==========================================================================
   registry.js — the portfolio index for elvinpeters.com/apps/

   ONE JSON entry per thing built. The hub page renders itself from this,
   so shipping something new means adding an object here and nothing else.

   status: 'live'    — public, linked, anyone can open it
           'private' — real and running, but behind a login; shown, not linked
           'soon'    — under construction; shown with no link
   demo: '<url>' — optional; a public no-login demo of a private tool (e.g. elvinpeters.com/record/demo/).
           The card links there with a "Demo" badge (card #530).
   Every `href` in here has been checked to return 200. Do not add a link
   without checking it first.
   ========================================================================== */

window.APPS_REGISTRY = {
  updated: '2026-08-04',

  categories: [
    { id: 'products',  label: 'Products',  blurb: 'The book and the systems built around it.' },
    { id: 'tools',     label: 'Tools',     blurb: 'Free, no sign-up, works on a phone. Open one and use it.' },
    { id: 'platforms', label: 'Platforms', blurb: 'The bigger builds: software other businesses run on.' },
    { id: 'sites',     label: 'Sites & directories', blurb: 'Content properties built to be found in search.' },
    { id: 'games',     label: 'Games',     blurb: 'Range: browser games written from scratch. No engine, no framework, no download.' }
  ],

  apps: [
    /* ---------------- platforms ---------------- */
    {
      slug: 'record-studio', name: 'Record Studio', cat: 'platforms', status: 'private',
      demo: 'https://elvinpeters.com/record/demo/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps',
      href: 'https://elvinpeters.com/record/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps',
      blurb: 'Turns an interview into a transcript of who said what and a summary. Tap to look through a finished sample. No sign-in.'
    },
    /* ---------------- tools ---------------- */
    {
      slug: 'calculators', name: 'Calculator Suite', cat: 'tools', status: 'live', featured: true,
      href: '/apps/calculators/',
      blurb: 'Eleven financial calculators that use the real Canadian math — semi-annual mortgage compounding, the actual OSFI stress test, Toronto land transfer tax. Every one shows its assumptions and every result is a shareable link.',
      stat: '11 calculators',
      tags: ['Zero dependencies', 'Canadian math', 'Shareable results']
    },
    {
      slug: 'quiz', name: 'Quiz Funnel', cat: 'tools', status: 'live',
      href: 'https://elvinpeters.com/quiz/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps',
      blurb: 'A config-driven quiz engine — questions, scoring and result pages all come from one file. Answers post straight into a lead database I own.',
      stat: 'Config-driven',
      tags: ['Lead capture', 'Self-hosted']
    },
    {
      slug: 'booking', name: 'Booking & Scheduler', cat: 'tools', status: 'live',
      href: 'https://meet.elvinpeters.com',
      blurb: 'A Calendly replacement I run myself. Availability rules, timezone handling, confirmation email — no third-party subscription and no data leaving my server.',
      stat: 'Owned end to end',
      tags: ['Self-hosted', 'Calendar sync']
    },
    {
      slug: 'titles', name: 'Title Search Reports', cat: 'tools', status: 'live',
      href: 'https://elvinpeters.com/titles/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps',
      blurb: 'A real productised service, not a demo: Ontario property title reports and title changes, ordered and paid for online.',
      stat: 'Live product',
      tags: ['Stripe checkout', 'Ontario']
    },
    {
      slug: 'qr-studio', name: 'QR Studio', cat: 'tools', status: 'private',
      blurb: 'A QR code generator with dynamic codes — the destination can be changed after the code is printed, and every scan is tracked. Runs on my own infrastructure so the codes never expire behind someone else\'s paywall.',
      stat: 'Dynamic + tracked',
      tags: ['Scan analytics', 'Self-hosted']
    },
    {
      slug: 'teleprompter', name: 'Teleprompter', cat: 'tools', status: 'private',
      blurb: 'Cross-device teleprompter with speed and size controls. Built in an afternoon because the App Store versions all wanted a subscription.',
      stat: 'Built in a day',
      tags: ['Mobile-first']
    },

    /* ---------------- games ---------------- */
    {
      slug: 'arcade', name: 'The Arcade', cat: 'games', status: 'live', featured: true,
      href: 'https://play.elvinpeters.com/',
      blurb: 'Thirteen browser games, all written from scratch. Seven of them are real-time multiplayer over a WebSocket server I run — share one lobby link and your friends are at the table.',
      stat: '13 games',
      tags: ['Multiplayer', 'No download', 'Zero dependencies']
    },
    {
      slug: 'dominion', name: 'Dominion', cat: 'games', status: 'live', featured: true,
      href: 'https://play.elvinpeters.com/dominion/',
      blurb: 'Age-of-Empires-style strategy played on a rotating 3D globe, rendered in plain canvas 2D with no WebGL and no libraries. Zoom into any territory and the war resolves as a lane battle.',
      stat: '3D globe, no WebGL',
      tags: ['Canvas 2D', 'Strategy']
    },
    {
      slug: 'outbreak', name: 'Outbreak', cat: 'games', status: 'live',
      href: 'https://play.elvinpeters.com/outbreak/',
      blurb: 'Run the global response to a pandemic on a live 3D Earth. Underneath is a real SIR epidemiological model — close borders too late and the curve does what curves do.',
      stat: 'Real SIR model',
      tags: ['Simulation', 'Canvas 2D']
    },
    {
      slug: 'hegemon', name: 'Hegemon', cat: 'games', status: 'live',
      href: 'https://play.elvinpeters.com/hegemon/',
      blurb: 'Civilization-scale grand strategy on a real world map: tech tree, diplomacy, alliances, and a mutually-assured-destruction endgame that you can absolutely trigger by accident.',
      stat: 'Full tech tree',
      tags: ['Strategy', 'World map']
    },
    {
      slug: 'prism-defense', name: 'Prism Defense', cat: 'games', status: 'live',
      href: 'https://play.elvinpeters.com/prism-defense/',
      blurb: 'Geometric tower defense with sixteen maps, nine bosses and an endless mode. One of three games sharing an engine — the whole family is configured, not re-coded.',
      stat: '16 maps · 9 bosses',
      tags: ['Tower defense', 'Shared engine']
    },
    {
      slug: 'lobby', name: 'Multiplayer Lobby', cat: 'games', status: 'live',
      href: 'https://play.elvinpeters.com/lobby/',
      blurb: 'The front door for multiplayer. Share one link, everyone sees each other, open a table for any game and sit down. New games appear here automatically the moment they register with the server.',
      stat: 'One link, any game',
      tags: ['WebSockets', 'Real-time']
    },

    /* ---------------- platforms ---------------- */
    {
      slug: 'convo', name: 'Convo', cat: 'platforms', status: 'live', featured: true,
      href: 'https://chat.elvinpeters.com',
      blurb: 'A white-label conversational lead funnel platform. Instead of a form, visitors have a short chat — and the whole flow is built in an admin panel with no code. Built to be resold under someone else\'s brand.',
      stat: 'White-label SaaS',
      tags: ['No-code builder', 'Self-hosted', 'Resellable']
    },
    {
      slug: 'empire-studio', name: 'Empire Studio', cat: 'platforms', status: 'private', featured: true,
      blurb: 'The big one. A site builder, funnel builder, email engine, CRM and booking admin in a single self-hosted platform — the parts of Wix, HubSpot and Calendly I actually needed, on hardware I control and pay for once.',
      stat: 'Replaces 4 SaaS tools',
      tags: ['Site builder', 'CRM', 'Email engine', 'Self-hosted']
    },
    {
      slug: 'coachingconnect', name: 'CoachingConnect', cat: 'platforms', status: 'live',
      href: 'https://www.coachingconnect.ca',
      blurb: 'A two-sided marketplace connecting athletes with coaches, complete with its own admin CMS for managing listings.',
      stat: 'Two-sided marketplace',
      tags: ['Marketplace', 'Custom CMS']
    },

    /* ---------------- products ---------------- */
    {
      slug: 'artificial-advantage', name: 'The Artificial Advantage (book)', cat: 'products', status: 'live', featured: true,
      href: 'https://elvinpeters.com/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps',
      blurb: 'The book: a framework for non-technical professionals to get real work out of AI. Kindle, paperback and hardcover on Amazon; every physical copy links to the companion resource library on this site.',
      stat: 'Vol 1, AI Fluency series',
      tags: ['Amazon', 'Companion library']
    },
    {
      slug: 'claude-manual', name: "The Claude Operator's Manual", cat: 'products', status: 'live',
      href: 'https://elvinpeters.com/claude/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps',
      blurb: "A 217-page field manual for running Claude as a daily operator: projects, skills, connectors, the API, and Claude Code. Written from using it every working day to ship real software.",
      stat: '217 pages',
      tags: ['Stripe checkout', 'Instant delivery']
    },
    {
      slug: 'site-studio', name: 'Site Studio', cat: 'platforms', status: 'private',
      blurb: 'The CMS behind this site: a phone-first admin app that edits content as JSON, previews with the real build engine, runs the polish gate, and publishes straight to production through git.',
      stat: 'Zero dependencies',
      tags: ['Self-hosted', 'Git-native', 'Build gate']
    },

    /* ---------------- sites ---------------- */
    {
      slug: 'ai-directory', name: 'Ultimate AI Directory', cat: 'sites', status: 'live', featured: true,
      href: 'https://ultimateaidirectory.com',
      // Counts are rewritten by coding/ai-tools-directory/sync_counts.py — do not hand-edit.
      blurb: 'A free, continuously-verified map of the AI landscape: /*AID:tools*/123/*/AID*/ tools, /*AID:courses*/51/*/AID*/ courses (/*AID:courses_free*/42/*/AID*/ of them free), the /*AID:repos*/120/*/AID*/ highest-starred open-source AI projects on GitHub, and /*AID:people*/64/*/AID*/ accounts worth following. The repos and follower counts come straight from the GitHub and X APIs, and every course URL is fetched at build time, so dead links never ship.',
      stat: '/*AID:total*/358/*/AID*/ verified resources',
      tags: ['Live API data', 'Link-verified', 'Self-hosted', 'SEO']
    },
    {
      slug: 'online-directory', name: 'Ultimate Online Directory', cat: 'sites', status: 'live',
      href: 'https://ultimateonlinedirectory.com',
      blurb: 'Sister property to the AI directory, built from the same engine — the point being that the second one took an afternoon.',
      stat: 'Same engine, 1 day',
      tags: ['Directory', 'Repeatable']
    },
    {
      slug: 'niche-directories', name: 'Niche Directory Network', cat: 'sites', status: 'live',
      href: 'https://ultimateonlinedirectory.com/house-cleaning',
      blurb: 'Fifteen local trade directories generated from one repeatable recipe. Roughly ten minutes from picking a niche to a deployed, indexable site.',
      stat: '15 directories',
      tags: ['Programmatic SEO', 'Vercel']
    }
  ]
};
